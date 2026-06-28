"""
AOI FLOW Cutout API - BiRefNet quality engine

目的:
- 商品画像の細かい境界に強い無料OSS系モデルをDockerで動かします。
- /cutout は既存Next.jsからそのまま呼び出せるmultipart APIです。
- 初回起動または初回処理時にHugging Faceからモデルを取得します。

注意:
- MacBook AirのCPUでは処理が重いです。実店舗で高品質が必要な画像だけに使う想定です。
- ネット接続が無い環境では初回モデル取得に失敗します。
"""

import io
import os
from functools import lru_cache

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps
from transformers import AutoModelForImageSegmentation
from torchvision import transforms

app = FastAPI(title="AOI FLOW Cutout API BiRefNet", version="2.0.0")

MODEL_ID = os.getenv("BIREFNET_MODEL_ID", "ZhengPeng7/BiRefNet").strip() or "ZhengPeng7/BiRefNet"
MAX_IMAGE_SIDE = int(os.getenv("CUTOUT_MAX_IMAGE_SIDE", "1800"))
INFERENCE_SIZE = int(os.getenv("BIREFNET_INFERENCE_SIZE", "1024"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


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
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    return image


@lru_cache(maxsize=1)
def load_model():
    try:
        model = AutoModelForImageSegmentation.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
        )
        model.to(DEVICE)
        model.eval()
        return model
    except Exception as exc:
        raise RuntimeError(f"BiRefNetモデルを読み込めません: {exc}")


def make_alpha(image: Image.Image) -> Image.Image:
    model = load_model()
    original_size = image.size

    transform = transforms.Compose(
        [
            transforms.Resize((INFERENCE_SIZE, INFERENCE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    tensor = transform(image).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        outputs = model(tensor)
        # BiRefNet系は最後の出力または単一出力に予測マスクが入る構造が多いです。
        if isinstance(outputs, (list, tuple)):
            pred = outputs[-1]
        else:
            pred = outputs
        pred = torch.sigmoid(pred)
        pred = pred.squeeze().detach().cpu().numpy()

    pred = (pred * 255).clip(0, 255).astype(np.uint8)
    alpha = Image.fromarray(pred, mode="L").resize(original_size, Image.LANCZOS)
    return alpha


def refine_alpha(alpha: Image.Image) -> Image.Image:
    arr = np.array(alpha, dtype=np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    arr = cv2.morphologyEx(arr, cv2.MORPH_CLOSE, kernel, iterations=1)
    arr = cv2.GaussianBlur(arr, (3, 3), 0)
    return Image.fromarray(arr, mode="L")


def alpha_score(alpha: Image.Image) -> dict:
    arr = np.array(alpha, dtype=np.uint8)
    total = max(1, arr.size)
    transparent = int(np.count_nonzero(arr < 8))
    opaque = int(np.count_nonzero(arr > 245))
    semi = int(np.count_nonzero((arr >= 8) & (arr <= 245)))
    transparent_ratio = transparent / total
    opaque_ratio = opaque / total
    semi_ratio = semi / total

    score = 100
    if transparent_ratio < 0.01:
        score -= 70
    if transparent_ratio > 0.985:
        score -= 80
    if opaque_ratio > 0.99:
        score -= 65
    if semi_ratio > 0.42:
        score -= 10
    return {
        "score": max(0, min(100, int(score))),
        "transparent_ratio": transparent_ratio,
        "opaque_ratio": opaque_ratio,
        "semi_ratio": semi_ratio,
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "birefnet",
        "model_id": MODEL_ID,
        "device": DEVICE,
        "inference_size": INFERENCE_SIZE,
    }


@app.post("/cutout")
async def cutout(file: UploadFile = File(...)):
    raw = await file.read()
    image = normalize_image(raw)

    try:
        alpha = refine_alpha(make_alpha(image))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"BiRefNet切り抜きに失敗しました: {exc}")

    stats = alpha_score(alpha)
    if stats["score"] < 35:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "BiRefNetの切り抜き品質が低いため失敗扱いにしました。",
                "stats": stats,
            },
        )

    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    buf = io.BytesIO()
    rgba.save(buf, format="PNG", optimize=True)

    headers = {
        "X-Cutout-Engine": "birefnet",
        "X-Cutout-Quality": str(stats["score"]),
        "X-Cutout-Verified": "docker-birefnet",
        "X-Cutout-Transparent-Ratio": f"{stats['transparent_ratio']:.4f}",
    }
    return Response(content=buf.getvalue(), media_type="image/png", headers=headers)
