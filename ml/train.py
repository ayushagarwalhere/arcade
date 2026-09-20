"""
One training round for the false-positive classifier.

Fine-tunes an open-source code encoder (default: microsoft/codebert-base) to
decide whether a scanner finding is a true positive (1) or a false positive (0).
A round starts from the previous round's checkpoint (`--init`), trains on the
new shard plus a replay sample of older data, and scores a frozen holdout.

The same file runs locally and as a SageMaker training job: every path defaults
to the SageMaker channel / model-dir environment variable when it is set.

  python ml/train.py --train data/incoming/shard-0001.jsonl --holdout data/holdout.jsonl --out runs/round-1
"""
import argparse
import contextlib
import json
import os
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

BASE_MODEL = "microsoft/codebert-base"


def read_jsonl(path):
    paths = sorted(Path(path).glob("*.jsonl")) if Path(path).is_dir() else [Path(path)]
    rows = []
    for p in paths:
        with open(p, encoding="utf-8-sig") as f:  # tolerate a BOM from Windows tools
            rows += [json.loads(line) for line in f if line.strip()]
    return rows


class Findings(Dataset):
    def __init__(self, rows, tokenizer, max_len, weak_weight):
        self.rows, self.tok, self.max_len, self.weak_weight = rows, tokenizer, max_len, weak_weight

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        enc = self.tok(r["text"], truncation=True, max_length=self.max_len)
        # Provenance labels are noisy, so they pull on the model less than exact ones.
        enc["weight"] = self.weak_weight if r.get("weak") else 1.0
        enc["label"] = r["label"]
        return enc


def collate(tokenizer):
    def fn(batch):
        weights = torch.tensor([b.pop("weight") for b in batch], dtype=torch.float)
        labels = torch.tensor([b.pop("label") for b in batch], dtype=torch.long)
        out = tokenizer.pad(batch, return_tensors="pt")
        out["labels"], out["weights"] = labels, weights
        return out

    return fn


def auc(scores, labels):
    """Probability a random true positive outranks a random false positive (rank-based, ties averaged)."""
    scores, labels = np.asarray(scores), np.asarray(labels)
    pos, neg = (labels == 1).sum(), (labels == 0).sum()
    if pos == 0 or neg == 0:
        return float("nan")
    order = scores.argsort()
    ranks = np.empty(len(scores))
    ranks[order] = np.arange(1, len(scores) + 1)
    for s in np.unique(scores):
        tie = scores == s
        ranks[tie] = ranks[tie].mean()
    return float((ranks[labels == 1].sum() - pos * (pos + 1) / 2) / (pos * neg))


def fp_caught_at_recall(scores, labels, recall=0.99):
    """The product question: if we must keep >= 99% of real vulnerabilities, what share of false alarms can we hide?"""
    scores, labels = np.asarray(scores), np.asarray(labels)
    tp_scores = np.sort(scores[labels == 1])
    if len(tp_scores) == 0 or (labels == 0).sum() == 0:
        return float("nan"), float("nan")
    threshold = tp_scores[int(np.floor((1 - recall) * len(tp_scores)))]
    return float((scores[labels == 0] < threshold).mean()), float(threshold)


def mixed_precision(device):
    """bf16 autocast on a GPU — roughly halves activation memory, which is what lets a 6 GB card train every layer."""
    return torch.autocast(device_type="cuda", dtype=torch.bfloat16) if device.type == "cuda" else contextlib.nullcontext()


@torch.no_grad()
def evaluate(model, loader, rows, device):
    model.eval()
    scores = []
    for batch in loader:
        batch = {k: v.to(device) for k, v in batch.items() if k not in ("labels", "weights")}
        scores += torch.softmax(model(**batch).logits, dim=-1)[:, 1].tolist()
    labels = [r["label"] for r in rows]
    pred = [int(s >= 0.5) for s in scores]

    def block(idx):
        if not idx:
            return None
        s, y, p = [scores[i] for i in idx], [labels[i] for i in idx], [pred[i] for i in idx]
        caught, thr = fp_caught_at_recall(s, y)
        return {"n": len(idx), "accuracy": float(np.mean([a == b for a, b in zip(p, y)])), "auc": auc(s, y), "fp_caught_at_99_recall": caught, "threshold": thr}

    everything = list(range(len(rows)))
    return {
        "overall": block(everything),
        "real": block([i for i in everything if rows[i]["source"] == "real"]),
        "synthetic": block([i for i in everything if rows[i]["source"] == "synthetic"]),
    }


def main():
    env = os.environ
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", default=env.get("SM_CHANNEL_TRAIN"))
    ap.add_argument("--replay", default=env.get("SM_CHANNEL_REPLAY"))
    ap.add_argument("--holdout", default=env.get("SM_CHANNEL_HOLDOUT"))
    ap.add_argument("--init", default=env.get("SM_CHANNEL_INIT") or BASE_MODEL, help="previous round's checkpoint, or a Hugging Face model id for round 1")
    ap.add_argument("--out", default=env.get("SM_MODEL_DIR", "runs/round"))
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--grad-accum", type=int, default=1, help="accumulate this many batches per optimizer step (effective batch = batch x grad-accum)")
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--max-len", type=int, default=192)
    ap.add_argument("--weak-weight", type=float, default=0.5)
    ap.add_argument("--freeze-layers", type=int, default=8, help="freeze embeddings and the bottom N encoder layers; 0 trains everything (use on a GPU)")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    # A SageMaker channel delivers the previous round as model.tar.gz; unpack it in place.
    packed = Path(args.init) / "model.tar.gz"
    if packed.exists():
        import tarfile

        with tarfile.open(packed) as tar:
            tar.extractall(Path(args.init), filter="data")

    random.seed(args.seed), np.random.seed(args.seed), torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    started = time.time()

    tokenizer = AutoTokenizer.from_pretrained(args.init)
    # Checkpoints are stored in 16-bit (see the save below); training always happens in 32-bit master weights.
    model = AutoModelForSequenceClassification.from_pretrained(args.init, num_labels=2).float().to(device)

    if args.freeze_layers:
        for p in model.base_model.embeddings.parameters():
            p.requires_grad = False
        for layer in model.base_model.encoder.layer[: args.freeze_layers]:
            for p in layer.parameters():
                p.requires_grad = False

    rows = read_jsonl(args.train) + (read_jsonl(args.replay) if args.replay and Path(args.replay).exists() else [])
    random.shuffle(rows)
    holdout = read_jsonl(args.holdout)
    print(f"device={device}  init={args.init}  train={len(rows)}  holdout={len(holdout)}  trainable={sum(p.numel() for p in model.parameters() if p.requires_grad) / 1e6:.0f}M params", flush=True)

    train_loader = DataLoader(Findings(rows, tokenizer, args.max_len, args.weak_weight), batch_size=args.batch, shuffle=True, collate_fn=collate(tokenizer))
    eval_loader = DataLoader(Findings(holdout, tokenizer, args.max_len, 1.0), batch_size=32, collate_fn=collate(tokenizer))

    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.01)
    batches = len(train_loader) * args.epochs
    total = max(1, batches // args.grad_accum)
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lambda s: min(1.0, (s + 1) / max(1, total // 10)) * max(0.0, (total - s) / total))
    loss_fn = torch.nn.CrossEntropyLoss(reduction="none")

    step = seen = 0
    for epoch in range(args.epochs):
        model.train()
        for batch in train_loader:
            labels, weights = batch.pop("labels").to(device), batch.pop("weights").to(device)
            with mixed_precision(device):
                logits = model(**{k: v.to(device) for k, v in batch.items()}).logits
            loss = (loss_fn(logits.float(), labels) * weights).sum() / weights.sum()
            (loss / args.grad_accum).backward()
            seen += 1
            if seen % args.grad_accum and seen != batches:
                continue
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step(), scheduler.step(), optimizer.zero_grad()
            step += 1
            if step % 10 == 0 or seen == batches:
                print(f"  step {step}/{total}  loss {loss.item():.4f}  {time.time() - started:.0f}s", flush=True)

    with mixed_precision(device):
        metrics = evaluate(model, eval_loader, holdout, device)
    metrics.update({"init": args.init, "train_rows": len(rows), "seconds": round(time.time() - started), "device": str(device)})

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    # Metrics first: they are what promotion reads, and they must survive even if saving weights fails.
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    # Half precision halves the checkpoint (~250 MB); two checkpoints exist at once during a round.
    model.half().save_pretrained(out), tokenizer.save_pretrained(out)
    print(json.dumps(metrics["overall"]), flush=True)


if __name__ == "__main__":
    main()
