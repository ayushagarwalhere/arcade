"""
Run one training round as a SageMaker training job — the same train.py, on a GPU.

NOT YET RUN: written against the SageMaker Python SDK but never executed from this
repository (no deployed AWS account at the time of writing). Check before first use:
  - the transformers/pytorch/py version triple below is one the SDK's HuggingFace
    estimator currently supports in your region;
  - your account has a non-zero quota for the training instance type (new accounts
    usually start at 0 for GPU instances: Service Quotas → SageMaker → "... for training job usage").

  pip install sagemaker
  python ml/sagemaker_round.py --bucket my-bucket --role arn:aws:iam::<acct>:role/<SageMakerRole> \
      --shard ml/data/incoming/shard-0001.jsonl [--init s3://my-bucket/arcade-fp/round-1/output/model.tar.gz]

Continual training on AWS is this script on a trigger: an S3 "object created" event on
the incoming/ prefix → EventBridge → a Lambda that calls it with the last promoted model
as --init. Promotion compares metrics.json exactly as ml/pipeline.py does locally.
"""
import argparse
import time
from pathlib import Path

import sagemaker
from sagemaker.huggingface import HuggingFace


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--role", required=True, help="SageMaker execution role ARN with access to the bucket")
    ap.add_argument("--shard", required=True)
    ap.add_argument("--holdout", default="ml/data/holdout.jsonl")
    ap.add_argument("--replay", default=None)
    ap.add_argument("--init", default=None, help="s3:// URI of the previous round's model.tar.gz")
    ap.add_argument("--instance-type", default="ml.g4dn.xlarge")
    ap.add_argument("--prefix", default="arcade-fp")
    args = ap.parse_args()

    session = sagemaker.Session(default_bucket=args.bucket)
    job = f"{args.prefix}-{time.strftime('%Y%m%d-%H%M%S')}"
    upload = lambda path, channel: session.upload_data(path, bucket=args.bucket, key_prefix=f"{args.prefix}/{job}/{channel}")

    inputs = {"train": upload(args.shard, "train"), "holdout": upload(args.holdout, "holdout")}
    if args.replay and Path(args.replay).exists() and Path(args.replay).stat().st_size:
        inputs["replay"] = upload(args.replay, "replay")
    if args.init:
        inputs["init"] = args.init  # train.py unpacks model.tar.gz from this channel

    estimator = HuggingFace(
        entry_point="train.py",
        source_dir=str(Path(__file__).parent),
        role=args.role,
        instance_type=args.instance_type,
        instance_count=1,
        transformers_version="4.49.0",
        pytorch_version="2.5.1",
        py_version="py311",
        # On a GPU there is no reason to freeze layers or stop at one epoch.
        hyperparameters={"epochs": 3, "batch": 32, "freeze-layers": 0, "max-len": 256},
        output_path=f"s3://{args.bucket}/{args.prefix}",
        base_job_name=args.prefix,
        max_run=3600,
        sagemaker_session=session,
    )
    estimator.fit(inputs, job_name=job)
    print("model:", estimator.model_data)


if __name__ == "__main__":
    main()
