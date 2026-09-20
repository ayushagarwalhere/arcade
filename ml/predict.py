"""
Score findings with the promoted model: P(true positive) per row.

  python ml/predict.py --runs %LOCALAPPDATA%\\arcade-ml\\runs --data some-findings.jsonl
  python ml/predict.py --runs ... --demo

Rows use the generator's shape; only `text` is read (rule, path, and the code window with the
flagged line marked `>>>`). The model path comes from <runs>/current.json, written on promotion.
"""
import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

DEMO = [
    ("request value concatenated into SQL", "rule: sql-injection\npath: src/api/invoices.js\n    router.get('/invoices/:id', async (req, res) => {\n>>>   const rows = await db.query(\"SELECT * FROM invoices WHERE id = \" + req.params.id);\n      res.json(rows);\n    });"),
    ("password literal in a test fixture", "rule: hardcoded-secret\npath: test/login.spec.ts\n    describe('login', () => {\n      it('rejects a wrong password', async () => {\n>>>     const password = \"not-the-right-password\";\n        await expect(login('ada', password)).rejects.toThrow();\n      });"),
    ("md5 used for a cache key", "rule: weak-hash\npath: src/lib/cache.ts\n    export function keyFor(body: Buffer) {\n>>>   return createHash(\"md5\").update(body).digest(\"hex\");\n    }"),
    ("md5 used to store a password", "rule: weak-hash\npath: src/services/accounts.js\n    async function register(email, password) {\n>>>   const hashed = crypto.createHash(\"md5\").update(password).digest(\"hex\");\n      await db.users.insert({ email, hashed });\n    }"),
]


@torch.no_grad()
def score(texts, checkpoint, max_len=256):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tok = AutoTokenizer.from_pretrained(checkpoint)
    model = AutoModelForSequenceClassification.from_pretrained(checkpoint).float().to(device).eval()
    out = []
    for i in range(0, len(texts), 32):
        enc = tok(texts[i : i + 32], truncation=True, max_length=max_len, padding=True, return_tensors="pt").to(device)
        out += torch.softmax(model(**enc).logits, dim=-1)[:, 1].tolist()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", required=True)
    ap.add_argument("--data")
    ap.add_argument("--demo", action="store_true")
    args = ap.parse_args()

    current = json.loads((Path(args.runs) / "current.json").read_text())
    print(f"model: round {current['round']}  ({current['checkpoint']})")
    if args.demo:
        for (label, _), p in zip(DEMO, score([t for _, t in DEMO], current["checkpoint"])):
            print(f"  P(true positive) = {p:.2f}   {label}")
        return
    rows = [json.loads(line) for line in open(args.data, encoding="utf-8-sig") if line.strip()]
    for row, p in zip(rows, score([r["text"] for r in rows], current["checkpoint"])):
        print(json.dumps({"id": row.get("id"), "ruleId": row.get("ruleId"), "path": row.get("path"), "line": row.get("line"), "p_true_positive": round(p, 4)}))


if __name__ == "__main__":
    main()
