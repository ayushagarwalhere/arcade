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

The Python environment lives outside the repository (and outside OneDrive):

```powershell
py -3.11 -m venv $env:LOCALAPPDATA\arcade-ml\venv
& $env:LOCALAPPDATA\arcade-ml\venv\Scripts\pip install --index-url https://download.pytorch.org/whl/cpu torch
& $env:LOCALAPPDATA\arcade-ml\venv\Scripts\pip install transformers numpy
```

Two terminals, from the repo root — data arrives while training runs:

```powershell
# 1 — the trainer: waits for shards, exits after 3 idle minutes
& $env:LOCALAPPDATA\arcade-ml\venv\Scripts\python ml\pipeline.py --data ml\data --runs $env:LOCALAPPDATA\arcade-ml\runs --idle-exit 180

# 2 — the data source: one shard every 60 s
npx tsx ml/generate.ts --repos $env:LOCALAPPDATA\arcade-ml\repos --shards 4 --interval 60
```

On a CPU the bottom 8 encoder layers are frozen so a round takes minutes. With a CUDA build of PyTorch (needs ~5 GB of
disk) pass `--train-args "--freeze-layers 0 --epochs 3"`; nothing else changes.

## What this is, and is not

It is a working pipeline: data generation, continual training with replay, a frozen holdout, gated promotion, and a
SageMaker launcher. It is **not yet a production classifier** — the real data is a few hundred weakly-labelled rows,
because a regex scanner fires rarely on real code. The pipeline is the durable part; the model gets good when real
triage labels flow through it.
