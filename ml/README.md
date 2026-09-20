# ml — the false-positive classifier

A continual fine-tuning pipeline. It teaches an open-source code model
([`microsoft/codebert-base`](https://huggingface.co/microsoft/codebert-base), 125M parameters) to tell a
real finding from a false alarm, and keeps teaching it as new labelled data arrives.

```
generate.ts ──► data/incoming/shard-*.jsonl ──► pipeline.py ──► train.py (one round)
   (keeps emitting shards)                          │              resume from the promoted checkpoint,
                                                    │              new shard + 30% replay of older data
                                                    ▼
                                      score the frozen holdout ──► promote, or keep the previous model
```

| File | What it does |
|---|---|
| [`generate.ts`](generate.ts) | Builds the dataset by running Arcade's **real scanner** over real repositories and over randomised synthetic variants, so rows look exactly like production findings. Emits training shards over time. |
| [`train.py`](train.py) | One round: fine-tune from the previous checkpoint, score the holdout, write `metrics.json`. Runs unchanged as a SageMaker training job. |
| [`pipeline.py`](pipeline.py) | Watches `data/incoming/`, runs a round per new shard, promotes only if the holdout AUC did not drop, keeps state so it can be stopped and resumed. |
| [`predict.py`](predict.py) | Scores findings with the currently promoted model: P(true positive) per row. |
| [`sagemaker_round.py`](sagemaker_round.py) | Launches a round on SageMaker (GPU). **Written but never run** — see the notes at the top of the file. |

## Where the labels come from

- **Real code, weak labels.** Hits in deliberately vulnerable apps (NodeGoat, DVNA, vulnerable-node) are labelled true
  positives — except in their tests and docs; hits in mature, audited libraries (express, fastify, lodash, socket.io, …)
  are labelled false positives. The labels are noisy, so these rows train at half weight.
- **Synthetic variants, exact labels.** Per rule, families of true positives and of the false positives the scanner's own
  guards do *not* already filter: UI message strings, test fixtures, sanitised HTML, a constant interpolated into a
  parameterised query, md5 used for an ETag. A variant is kept only if the real scanner flags the intended line.
- **Later, through the same folder:** users' triage decisions from the API, and Claude-labelled findings once Bedrock
  is deployed. Anything that writes a shard to `data/incoming/` is a data source.

The **holdout is frozen and disjoint**: whole repositories (`goof`, `koa`, `axios`) and whole synthetic families the
model never trains on. Its score measures generalisation, not memorised templates. Metrics are reported separately for
real and synthetic rows, plus the number that matters to the product: *if we must keep ≥99% of real vulnerabilities,
what share of false alarms could be hidden?*

## Run it

Needs Python with `torch`, `transformers` and `numpy`. A CUDA build of PyTorch is used automatically when present
(bf16 mixed precision; a 6 GB card trains every layer). Checkpoints and cloned repositories live outside the repository
and outside OneDrive, under `%LOCALAPPDATA%\arcade-ml`.

Two terminals, from the repo root — data arrives while training runs:

```powershell
# 1 — the trainer: waits for shards, exits after 150 idle seconds
py -3.14 ml\pipeline.py --data ml\data --runs $env:LOCALAPPDATA\arcade-ml\runs --idle-exit 150 `
    --train-args "--epochs 3 --batch 8 --grad-accum 2 --max-len 256 --freeze-layers 0"

# 2 — the data source: one shard every 45 s
npx tsx ml/generate.ts --repos $env:LOCALAPPDATA\arcade-ml\repos --shards 4 --interval 45

# afterwards — score findings with whichever model is currently promoted
py -3.14 ml\predict.py --runs $env:LOCALAPPDATA\arcade-ml\runs --demo
```

Without a GPU, drop `--train-args`: the defaults freeze the bottom 8 encoder layers and train one epoch, so a round
takes minutes on a CPU. `--base <dir>` starts round 1 from a local copy of the model instead of downloading it.

## First run — 2026-09-20, RTX 4050 Laptop (6 GB)

Four shards delivered 45 s apart; each round trained while the next shard was still being generated.

| Round | Rows (new + replay) | Time | Holdout AUC | — real rows | — synthetic rows | False alarms hideable at ≥99% TP recall | Promoted |
|---|---|---|---|---|---|---|---|
| 1 | 423 | 22 s | 0.699 | 0.593 | 0.611 | 12.9% | yes |
| 2 | 549 | 29 s | **0.894** | 0.782 | 0.986 | 55.9% | **yes — current model** |
| 3 | 676 | 39 s | 0.814 | 0.786 | 0.965 | 31.2% | no — AUC dropped, round 2 kept |
| 4 | 803 | 102 s | 0.876 | 0.771 | 1.000 | 66.1% | no — below round 2 |

Holdout: 438 rows the model never trained on — 78 real (repositories `goof`, `axios`, `koa`) and 360 from held-out
synthetic families.

How to read this honestly:

- **The synthetic number (0.97–1.00) shows the model generalises to template families it never saw** — but they are
  still templates written in one style. It is not evidence about real code.
- **The real number (~0.78) is the one that matters, and it is soft.** It rests on 78 rows whose labels come from
  provenance, not review, with only a handful of true positives among them; a few rows either way would move it by
  several points. Better than chance, far from shippable.
- **The "hideable" column is optimistic**: its threshold is chosen on the same holdout it is measured on.
- **Rounds are noisy** (round 3 dipped, round 4 recovered), which is what a few hundred rows per round looks like. The
  promotion gate handled it — a worse model never replaced a better one. Round 4 actually wins on the product metric
  while losing on AUC, so which metric gates promotion is a decision worth revisiting once real labels exist.

## In production: SageMaker Serverless Inference

The promoted model is hosted on a serverless endpoint (scales to zero; pay per request). It is its **own stack in its
own CDK app** ([`infra/bin/ml.ts`](../infra/bin/ml.ts)), so deploying it cannot touch the API, the table, Cognito or the website.

```powershell
py -3.14 ml\package_model.py --runs $env:LOCALAPPDATA\arcade-ml\runs --base $env:LOCALAPPDATA\arcade-ml\codebert-base --out $env:LOCALAPPDATA\arcade-ml\deploy\model.tar.gz
cd infra   # with AWS credentials in the environment
npx cdk --app "npx tsx bin/ml.ts" deploy ArcadeMl-prod -c stage=prod -c modelArtifact=$env:LOCALAPPDATA\arcade-ml\deploy\model.tar.gz -c modelVersion=r2
py -3.14 ..\ml\invoke_endpoint.py --endpoint arcade-fp-classifier-prod --region us-east-1
```

Bump `modelVersion` when the model changes; CloudFormation then creates the new model and rolls the endpoint over to it.

Deployed 2026-09-20 as `arcade-fp-classifier-prod` (us-east-1), model r2: **6.7 s cold, 1.3 s warm** for a batch of four.

The API uses it once the main stack is deployed with `-c fpEndpointName=arcade-fp-classifier-prod`: that sets
`FP_ENDPOINT_NAME` and grants the API `sagemaker:InvokeEndpoint` on that one endpoint. Findings are then scored as they
are saved (`score.pTruePositive` on each record); a cold or failing endpoint means "saved without a score", never an
error, and `POST …/runs/:run/findings/score` fills in whatever was missed. The request text is built by
[`packages/core/src/finding-text.ts`](../packages/core/src/finding-text.ts), shared with the generator, so the model is
asked about exactly what it was trained on.

## What this is, and is not

It is a working pipeline: data generation, continual training with replay, a frozen holdout, gated promotion, and a
SageMaker launcher. It is **not yet a production classifier** — the real data is a few hundred weakly-labelled rows,
because a regex scanner fires rarely on real code. The pipeline is the durable part; the model gets good when real
triage labels flow through it.
