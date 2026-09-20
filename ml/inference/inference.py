"""
SageMaker inference handler for the false-positive classifier (Hugging Face inference toolkit).

Request   {"inputs": ["rule: …\\npath: …\\n    code\\n>>> flagged line\\n    code", …]}   (a single string also works)
Response  {"scores": [0.97, …]}   — P(true positive) per input, in order

The input text must be built exactly as in training: see `toText` in ml/generate.ts.
"""
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MAX_LEN = 256
MAX_INPUTS = 64


def model_fn(model_dir):
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    # The checkpoint is stored in 16-bit to halve its size; CPU inference runs in 32-bit.
    model = AutoModelForSequenceClassification.from_pretrained(model_dir, torch_dtype=torch.float32).float().eval()
    return model, tokenizer


@torch.no_grad()
def predict_fn(data, bundle):
    model, tokenizer = bundle
    inputs = data.get("inputs") if isinstance(data, dict) else data
    texts = [inputs] if isinstance(inputs, str) else list(inputs or [])
    if not texts or len(texts) > MAX_INPUTS or not all(isinstance(t, str) for t in texts):
        raise ValueError(f'"inputs" must be a string or a list of 1-{MAX_INPUTS} strings')
    enc = tokenizer(texts, truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
    scores = torch.softmax(model(**enc).logits, dim=-1)[:, 1]
    return {"scores": [round(float(s), 4) for s in scores]}
