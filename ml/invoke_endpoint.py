"""
Call the deployed classifier endpoint — a smoke test, and a reference for the request shape.

  python ml/invoke_endpoint.py --endpoint arcade-fp-classifier-prod --region us-east-1

Credentials come from the usual AWS chain, or from a dotenv file via --env (values are never printed).
The first call after the endpoint has been idle pays a cold start of tens of seconds.
"""
import argparse
import json
import time
from pathlib import Path

import boto3
from botocore.config import Config

EXAMPLES = [
    ("request value concatenated into SQL", 'rule: sql-injection\npath: src/api/invoices.js\n    router.get("/invoices/:id", async (req, res) => {\n>>>   const rows = await db.query("SELECT * FROM invoices WHERE id = " + req.params.id);\n      res.json(rows);'),
    ("password literal in a test fixture", 'rule: hardcoded-secret\npath: test/login.spec.ts\n    it("rejects a wrong password", async () => {\n>>>     const password = "not-the-right-password";\n        await expect(login("ada", password)).rejects.toThrow();'),
    ("md5 used for a cache key", 'rule: weak-hash\npath: src/lib/cache.ts\n    export function keyFor(body: Buffer) {\n>>>   return createHash("md5").update(body).digest("hex");\n    }'),
    ("md5 used to store a password", 'rule: weak-hash\npath: src/services/accounts.js\n    async function register(email, password) {\n>>>   const hashed = crypto.createHash("md5").update(password).digest("hex");\n      await db.users.insert({ email, hashed });'),
]


def session(env_path, region):
    if not env_path:
        return boto3.Session(region_name=region)
    e = {}
    for line in Path(env_path).read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.strip().split("=", 1)
            e[k.replace("export ", "").strip()] = v.strip().strip('"').strip("'")
    return boto3.Session(aws_access_key_id=e["AWS_ACCESS_KEY_ID"], aws_secret_access_key=e["AWS_SECRET_ACCESS_KEY"], region_name=region or e.get("AWS_REGION"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", required=True)
    ap.add_argument("--region", default=None)
    ap.add_argument("--env", default=None)
    args = ap.parse_args()

    runtime = session(args.env, args.region).client("sagemaker-runtime", config=Config(read_timeout=90, retries={"max_attempts": 3, "mode": "standard"}))
    body = json.dumps({"inputs": [text for _, text in EXAMPLES]})
    for attempt in ("first call (may be cold)", "second call (warm)"):
        started = time.time()
        res = runtime.invoke_endpoint(EndpointName=args.endpoint, ContentType="application/json", Accept="application/json", Body=body)
        scores = json.loads(res["Body"].read())["scores"]
        print(f"{attempt}: {time.time() - started:.1f}s")
    for (label, _), p in zip(EXAMPLES, scores):
        print(f"  P(true positive) = {p:.2f}   {label}")


if __name__ == "__main__":
    main()
