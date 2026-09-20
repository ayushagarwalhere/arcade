"""
Package the promoted checkpoint as the model.tar.gz SageMaker expects.

  python ml/package_model.py --runs %LOCALAPPDATA%\\arcade-ml\\runs --base %LOCALAPPDATA%\\arcade-ml\\codebert-base --out %LOCALAPPDATA%\\arcade-ml\\deploy\\model.tar.gz

Weights and config come from the promoted round; tokenizer files come from the original base model, so the
archive loads under the (older) transformers version inside the inference container as well as the one that trained it.
"""
import argparse
import json
import tarfile
from pathlib import Path

TOKENIZER_FILES = ["vocab.json", "merges.txt", "tokenizer_config.json", "special_tokens_map.json"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    current = json.loads((Path(args.runs) / "current.json").read_text())
    ckpt, base, out = Path(current["checkpoint"]), Path(args.base), Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    with tarfile.open(out, "w:gz", compresslevel=1) as tar:  # 16-bit weights barely compress; don't spend minutes trying
        tar.add(ckpt / "model.safetensors", "model.safetensors")
        tar.add(ckpt / "config.json", "config.json")
        for name in TOKENIZER_FILES:
            tar.add(base / name, name)
        tar.add(Path(__file__).parent / "inference" / "inference.py", "code/inference.py")
    (out.parent / "model-info.json").write_text(json.dumps({"round": current["round"], "metrics": current["metrics"]["overall"]}, indent=2))
    print(f"round {current['round']} → {out}  ({out.stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
