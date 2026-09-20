"""
The continual fine-tuning loop.

Watches data/incoming/ for new shards — from the generator today, from users'
triage decisions later — and runs one training round per shard while more data
keeps arriving:

    new shard ─► train from the promoted checkpoint on (shard + replay of older data)
              ─► score the frozen holdout
              ─► promote only if the holdout AUC did not drop; otherwise keep the old model

State lives in <runs>/state.json, so the loop can be stopped and resumed. Only
the promoted checkpoint is kept on disk; a rejected round's weights are deleted.

  python ml/pipeline.py --data ml/data --runs %LOCALAPPDATA%\\arcade-ml\\runs --idle-exit 120
"""
import argparse
import json
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path

TOLERANCE = 0.005  # a round may dip this much on the holdout and still be promoted (noise, not regression)
REPLAY_FRACTION = 0.3


def load_state(path):
    if path.exists():
        return json.loads(path.read_text())
    return {"rounds": [], "consumed": [], "promoted": None, "best_auc": None}


def stable(path, wait=2.0):
    """A shard is ready once it has stopped growing."""
    size = path.stat().st_size
    time.sleep(wait)
    return size > 0 and path.stat().st_size == size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="ml/data")
    ap.add_argument("--runs", default="ml/runs")
    ap.add_argument("--poll", type=float, default=5.0)
    ap.add_argument("--idle-exit", type=float, default=0, help="stop after this many seconds with no new shard (0 = run forever)")
    ap.add_argument("--base", default=None, help="round 1 starts here: a local model directory or a Hugging Face id (default: train.py's)")
    ap.add_argument("--train-args", default="", help='extra arguments for train.py, e.g. "--epochs 2 --freeze-layers 0"')
    args = ap.parse_args()

    data, runs = Path(args.data), Path(args.runs)
    incoming, seen_file, state_file = data / "incoming", runs / "seen.jsonl", runs / "state.json"
    runs.mkdir(parents=True, exist_ok=True)
    state = load_state(state_file)
    idle_since = time.time()
    print(f"watching {incoming}  ·  promoted: {state['promoted'] or 'none (round 1 starts from the base model)'}", flush=True)

    while True:
        pending = [p for p in sorted(incoming.glob("*.jsonl")) if p.name not in state["consumed"]]
        if not pending:
            if args.idle_exit and time.time() - idle_since > args.idle_exit:
                break
            time.sleep(args.poll)
            continue
        shard = pending[0]
        if not stable(shard):
            continue

        n = len(state["rounds"]) + 1
        out = runs / f"round-{n}"
        replay = runs / "replay.jsonl"
        older = seen_file.read_text(encoding="utf-8").splitlines() if seen_file.exists() else []
        random.seed(n)
        replay.write_text("\n".join(random.sample(older, int(len(older) * REPLAY_FRACTION))) + "\n" if older else "", encoding="utf-8")

        print(f"\n=== round {n}: {shard.name}  (+{int(len(older) * REPLAY_FRACTION)} replayed of {len(older)} seen) ===", flush=True)
        cmd = [sys.executable, str(Path(__file__).with_name("train.py")), "--train", str(shard), "--replay", str(replay), "--holdout", str(data / "holdout.jsonl"), "--out", str(out)]
        if state["promoted"] or args.base:
            cmd += ["--init", state["promoted"] or args.base]
        subprocess.run(cmd + args.train_args.split(), check=True)

        metrics = json.loads((out / "metrics.json").read_text())
        score = metrics["overall"]["auc"]
        promoted = state["best_auc"] is None or score >= state["best_auc"] - TOLERANCE
        if promoted:
            if state["promoted"]:
                shutil.rmtree(state["promoted"], ignore_errors=True)
            state["promoted"], state["best_auc"] = str(out), max(score, state["best_auc"] or 0)
            (runs / "current.json").write_text(json.dumps({"checkpoint": str(out), "round": n, "metrics": metrics}, indent=2))
        else:
            for f in out.glob("*"):
                if f.name != "metrics.json":
                    f.unlink()
        print(f"round {n}: holdout AUC {score:.4f}  →  {'PROMOTED' if promoted else 'rejected, keeping ' + str(state['promoted'])}", flush=True)

        with open(seen_file, "a", encoding="utf-8") as f:
            f.write(shard.read_text(encoding="utf-8"))
        state["consumed"].append(shard.name)
        state["rounds"].append({"round": n, "shard": shard.name, "promoted": promoted, **{k: metrics[k] for k in ("overall", "real", "synthetic", "train_rows", "seconds")}})
        state_file.write_text(json.dumps(state, indent=2))
        idle_since = time.time()

    print("\nround  rows   AUC     real-AUC  synth-AUC  FP hidden @99% recall  promoted")
    for r in state["rounds"]:
        g = lambda b, k: f"{r[b][k]:.3f}" if r.get(b) and r[b].get(k) == r[b].get(k) else "  -  "
        print(f"{r['round']:>5}  {r['train_rows']:>4}   {g('overall', 'auc')}   {g('real', 'auc')}     {g('synthetic', 'auc')}      {g('overall', 'fp_caught_at_99_recall')}                  {'yes' if r['promoted'] else 'no'}")


if __name__ == "__main__":
    main()
