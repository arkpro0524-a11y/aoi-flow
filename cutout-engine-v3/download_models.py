import os
from pathlib import Path

from huggingface_hub import snapshot_download


MODELS_DIR = Path(os.getenv("CUTOUT_MODELS_DIR", "/models"))
BIREFNET_MODEL_ID = os.getenv("BIREFNET_MODEL_ID", "ZhengPeng7/BiRefNet").strip() or "ZhengPeng7/BiRefNet"


def main() -> None:
    target = MODELS_DIR / "birefnet"
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=BIREFNET_MODEL_ID,
        local_dir=target,
        local_dir_use_symlinks=False,
        ignore_patterns=["*.md", "*.txt", ".gitattributes"],
    )


if __name__ == "__main__":
    main()
