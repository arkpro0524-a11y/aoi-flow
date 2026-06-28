"""
AOI FLOW Cutout API - rembg updated engine

目的:
- 既存の /cutout エンドポイントを維持します。
- 従来の u2net だけでなく、商品画像で比較的強い isnet-general-use を標準にします。
- 返却PNGのアルファを点検し、明らかな失敗をHTTP 422で返します。
- Next.js 側は CUTOUT_API_URL=http://localhost:8080/cutout のまま利用できます。

注意:
- 初回実行時、rembg がモデルを自動ダウンロードします。
- Docker の初回切り抜きはモデルDLのため数分かかる場合があります。
"""

import io
import os
from functools import lru_cache
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps
from rembg import new_session, remove

app = FastAPI(title="AOI FLOW Cutout API rembg updated", version="2.0.0")

# rembgで使える代表モデル。
# isnet-general-use: 汎用物体・商品に比較的強い。まずこれを標準にします。
# u2net: 従来モデル。保険。
# u2netp: 軽量だが品質は落ちます。
ALLOWED_MODELS = {
    "isnet-general-use",
    "u2net",
    "u2netp",
    "silueta",
}

DEFAULT_MODEL = os.getenv("CUTOUT_REMBG_MODEL", "isnet-general-use").strip() or "isnet-general-use"
MAX_IMAGE_SIDE = int(os.getenv("CUTOUT_MAX_IMAGE_SIDE", "2400"))


@lru_cache(maxsize=8)
def get_session(model_name: str):
    """モデルセッションをキャッシュして、2回目以降を高速化します。"""
    safe_model = model_name if model_name in ALLOWED_MODELS else DEFAULT_MODEL
    return new_session(safe_model)


def normalize_image(raw: bytes) -> Image.Image:
    """EXIF回転を反映し、巨大画像は処理しやすいサイズに縮小します。"""
    try:
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGBA")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"画像を読み込めません: {exc}")

    width, height = image.size
    longest = max(width, height)
    if longest > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / float(longest)
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    return image


def alpha_stats(png_bytes: bytes) -> dict:
    """PNGの透明度を確認し、ただのPNG返却や全消しを検出します。"""
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    alpha = np.array(image.getchannel("A"), dtype=np.uint8)
    total = max(1, alpha.size)
    transparent = int(np.count_nonzero(alpha < 8))
    opaque = int(np.count_nonzero(alpha > 245))
    semi = int(np.count_nonzero((alpha >= 8) & (alpha <= 245)))
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
    if semi_ratio > 0.38:
        score -= 15

    return {
        "transparent_ratio": transparent_ratio,
        "opaque_ratio": opaque_ratio,
        "semi_ratio": semi_ratio,
        "score": max(0, min(100, int(score))),
    }


def refine_alpha(png_bytes: bytes) -> bytes:
    """輪郭を少し整えます。商品を痩せさせすぎないように弱めの補正です。"""
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    arr = np.array(image)
    alpha = arr[:, :, 3]

    # 小さな透明ノイズ・穴を軽く補正します。
    kernel = np.ones((3, 3), np.uint8)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, kernel, iterations=1)

    # ギザつきを軽く丸めます。
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    arr[:, :, 3] = alpha
    out = Image.fromarray(arr, mode="RGBA")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "rembg-updated",
        "default_model": DEFAULT_MODEL,
        "allowed_models": sorted(ALLOWED_MODELS),
    }


@app.get("/engines")
def engines():
    return {
        "engines": [
            {
                "name": "rembg-isnet-general-use",
                "model": "isnet-general-use",
                "recommended": True,
                "note": "無料Dockerの標準。従来u2netより商品向けに使いやすい候補。",
            },
            {
                "name": "rembg-u2net",
                "model": "u2net",
                "recommended": False,
                "note": "従来モデル。保険。",
            },
        ]
    }


@app.post("/cutout")
async def cutout(
    file: UploadFile = File(...),
    model: Optional[str] = Form(default=None),
    refine: Optional[str] = Form(default="true"),
):
    raw = await file.read()
    image = normalize_image(raw)

    requested_model = (model or DEFAULT_MODEL).strip()
    if requested_model not in ALLOWED_MODELS:
        requested_model = DEFAULT_MODEL

    input_buf = io.BytesIO()
    image.save(input_buf, format="PNG")

    try:
        output = remove(
            input_buf.getvalue(),
            session=get_session(requested_model),
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=8,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"rembg切り抜きに失敗しました: {exc}")

    if str(refine).lower() != "false":
        output = refine_alpha(output)

    stats = alpha_stats(output)
    if stats["score"] < 35:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "切り抜き品質が低いため失敗扱いにしました。",
                "stats": stats,
                "engine": f"rembg:{requested_model}",
            },
        )

    headers = {
        "X-Cutout-Engine": f"rembg:{requested_model}",
        "X-Cutout-Quality": str(stats["score"]),
        "X-Cutout-Verified": "docker-rembg-updated",
        "X-Cutout-Transparent-Ratio": f"{stats['transparent_ratio']:.4f}",
    }
    return Response(content=output, media_type="image/png", headers=headers)
