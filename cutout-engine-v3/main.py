import io
import os
import time
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageFilter, ImageOps
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

APP_VERSION = "v3"
PROVIDER = "docker"
MODELS_DIR = Path(os.getenv("CUTOUT_MODELS_DIR", "/models"))
MAX_IMAGE_SIDE = int(os.getenv("CUTOUT_MAX_IMAGE_SIDE", "2200"))
INFERENCE_SIZE = int(os.getenv("BIREFNET_INFERENCE_SIZE", "1024"))
MIN_QUALITY = int(os.getenv("CUTOUT_MIN_QUALITY", "35"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

app = FastAPI(title="AOI Cutout Engine V3", version=APP_VERSION)
READY = False
READY_ERROR = ""
ACTIVE_ENGINE = "BiRefNet"


def normalize_image(raw: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"画像を読み込めません: {exc}")

    width, height = image.size
    longest = max(width, height)
    if longest > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / float(longest)
        image = image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)
    return image


def refine_alpha(alpha: Image.Image) -> Image.Image:
    alpha = alpha.filter(ImageFilter.MedianFilter(size=3))
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.35))
    return alpha


def quality_score(alpha: Image.Image) -> dict:
    arr = np.array(alpha.resize((512, max(1, round(alpha.height * 512 / max(1, alpha.width)))), Image.Resampling.BILINEAR), dtype=np.uint8)
    total = max(1, arr.size)
    transparent = int(np.count_nonzero(arr < 8))
    opaque = int(np.count_nonzero(arr > 247))
    semi = int(np.count_nonzero((arr >= 8) & (arr <= 247)))
    transparent_ratio = transparent / total
    foreground_ratio = (opaque + semi) / total
    semi_ratio = semi / total
    edge_ratio = (int(np.count_nonzero(np.abs(np.diff(arr.astype(np.int16), axis=0)) > 72)) + int(np.count_nonzero(np.abs(np.diff(arr.astype(np.int16), axis=1)) > 72))) / total
    noise_ratio = int(np.count_nonzero((arr > 0) & (arr < 42))) / total

    outline = 100 if 0.002 <= edge_ratio <= 0.24 else 62
    missing = 100 if 0.03 <= foreground_ratio <= 0.96 else 48
    holes = max(40, 100 - int(max(0.0, semi_ratio - 0.32) * 160))
    transparent_score = 100 if 0.01 <= transparent_ratio <= 0.96 else 35
    edge = 100 if 0.002 <= semi_ratio <= 0.28 else 82
    noise = max(45, 100 - int(noise_ratio * 500))
    foreground = 100 if 0.03 <= foreground_ratio <= 0.96 else 45
    subject = 100 if transparent_ratio >= 0.01 and foreground_ratio >= 0.03 and edge_ratio > 0.002 else 35
    score = round(outline * 0.16 + missing * 0.14 + holes * 0.12 + transparent_score * 0.14 + edge * 0.14 + noise * 0.10 + foreground * 0.10 + subject * 0.10)

    return {
        "score": max(0, min(100, score)),
        "outline": outline,
        "missing": missing,
        "holes": holes,
        "transparent": transparent_score,
        "edge": edge,
        "noise": noise,
        "foreground": foreground,
        "subject": subject,
        "transparent_ratio": transparent_ratio,
        "foreground_ratio": foreground_ratio,
        "semi_transparent_ratio": semi_ratio,
    }


class CutoutEngine(ABC):
    name: str

    @abstractmethod
    def warmup(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def cutout(self, image: Image.Image) -> tuple[Image.Image, dict]:
        raise NotImplementedError


class BiRefNetEngine(CutoutEngine):
    name = "BiRefNet"

    @lru_cache(maxsize=1)
    def model(self):
        model_path = MODELS_DIR / "birefnet"
        model = AutoModelForImageSegmentation.from_pretrained(
            str(model_path),
            trust_remote_code=True,
            local_files_only=True,
        )
        model.to(DEVICE)
        model.eval()
        return model

    def warmup(self) -> None:
        self.model()

    def cutout(self, image: Image.Image) -> tuple[Image.Image, dict]:
        transform = transforms.Compose(
            [
                transforms.Resize((INFERENCE_SIZE, INFERENCE_SIZE)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        tensor = transform(image).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            outputs = self.model()(tensor)
            pred = outputs[-1] if isinstance(outputs, (list, tuple)) else outputs
            pred = torch.sigmoid(pred).squeeze().detach().cpu().numpy()
        alpha = Image.fromarray((pred * 255).clip(0, 255).astype(np.uint8), mode="L").resize(image.size, Image.Resampling.LANCZOS)
        alpha = refine_alpha(alpha)
        rgba = image.convert("RGBA")
        rgba.putalpha(alpha)
        return rgba, quality_score(alpha)


ENGINE = BiRefNetEngine()


@app.on_event("startup")
def startup() -> None:
    global READY, READY_ERROR
    try:
        if os.getenv("CUTOUT_READY_ON_START", "true").lower() == "true":
            ENGINE.warmup()
        READY = True
        READY_ERROR = ""
    except Exception as exc:
        READY = False
        READY_ERROR = str(exc)


@app.get("/health")
def health():
    return {
        "ready": READY,
        "provider": PROVIDER,
        "engine": ENGINE.name,
        "version": APP_VERSION,
        "device": DEVICE,
        "mode": "birefnet-high-quality",
        "error": READY_ERROR,
    }


def png_response(image: Image.Image, quality: dict, elapsed: int) -> Response:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    headers = {
        "X-Cutout-Provider": PROVIDER,
        "X-Cutout-Engine": ENGINE.name,
        "X-Cutout-Quality": str(quality["score"]),
        "X-Cutout-Elapsed": str(elapsed),
        "X-Cutout-Verified": "true",
    }
    return Response(content=buf.getvalue(), media_type="image/png", headers=headers)


@app.post("/cutout")
async def cutout(file: UploadFile = File(...)):
    if not READY:
        raise HTTPException(status_code=503, detail={"message": "AOI Cutout Engine V3 is not ready", "error": READY_ERROR})
    started = time.time()
    raw = await file.read()
    image = normalize_image(raw)
    rgba, quality = ENGINE.cutout(image)
    if quality["score"] < MIN_QUALITY:
        raise HTTPException(status_code=422, detail={"message": "切り抜き品質が低いため停止しました", "quality": quality})
    elapsed = int((time.time() - started) * 1000)
    return png_response(rgba, quality, elapsed)
