import os
import uuid
import math
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

app = FastAPI(title="AOI FLOW Burn API")


class Overlay(BaseModel):
    text: Optional[str] = ""
    logoUrl: Optional[str] = ""

    startSec: Optional[float] = 0
    endSec: Optional[float] = 5

    position: Optional[Literal["top", "center", "bottom", "leftBottom", "rightBottom"]] = "bottom"
    fontSize: Optional[int] = 42
    fontColor: Optional[str] = "#FFFFFF"
    fontWeight: Optional[Literal["normal", "bold"]] = "bold"
    lineHeight: Optional[float] = 1.25

    boxEnabled: Optional[bool] = True
    boxColor: Optional[str] = "#000000"
    boxOpacity: Optional[float] = 0.45

    logoEnabled: Optional[bool] = False
    logoPosition: Optional[Literal["top", "center", "bottom", "leftBottom", "rightBottom"]] = "top"
    logoWidth: Optional[int] = 140
    logoOpacity: Optional[float] = 0.9


class BurnRequest(BaseModel):
    videoUrl: str
    text: Optional[str] = ""
    fontSize: Optional[int] = 48
    y: Optional[float] = 70
    seconds: Optional[float] = 6


class CmBurnRequest(BaseModel):
    videoUrl: str
    overlay: Overlay
    seconds: Optional[float] = 5


def clamp_number(value, fallback, min_value, max_value):
    try:
        n = float(value)
        if math.isnan(n):
            return fallback
        return max(min_value, min(max_value, n))
    except Exception:
        return fallback


def parse_hex_color(value: str, fallback=(255, 255, 255, 255)):
    if not value:
        return fallback

    s = str(value).strip()

    if s.startswith("#") and len(s) == 7:
        try:
            return (
                int(s[1:3], 16),
                int(s[3:5], 16),
                int(s[5:7], 16),
                255,
            )
        except Exception:
            return fallback

    return fallback


def with_opacity(rgba, opacity: float):
    o = int(max(0, min(1, opacity)) * 255)
    return (rgba[0], rgba[1], rgba[2], o)


def find_japanese_font():
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]

    for p in candidates:
        if os.path.exists(p):
            return p

    return None


def load_font(size: int):
    font_path = find_japanese_font()
    if font_path:
        return ImageFont.truetype(font_path, size=size)

    return ImageFont.load_default()


def safe_lines(text: str, limit: int = 5):
    return [line.strip() for line in str(text or "").splitlines() if line.strip()][:limit]


async def download_file(url: str, output_path: Path):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url)

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"素材取得に失敗しました: {response.status_code}")

    output_path.write_bytes(response.content)

    if output_path.stat().st_size <= 0:
        raise HTTPException(status_code=502, detail="素材データが空です")


def ffprobe_size(video_path: Path):
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        str(video_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"ffprobe failed: {result.stderr}")

    raw = result.stdout.strip()

    if "x" not in raw:
        raise HTTPException(status_code=500, detail="動画サイズを取得できませんでした")

    w, h = raw.split("x", 1)
    return int(w), int(h)


def text_position(position: str, width: int, height: int, box_w: int, box_h: int):
    margin_x = int(width * 0.07)
    margin_y = int(height * 0.10)

    if position == "top":
        return int((width - box_w) / 2), int(height * 0.10)

    if position == "center":
        return int((width - box_w) / 2), int((height - box_h) / 2)

    if position == "leftBottom":
        return margin_x, height - box_h - margin_y

    if position == "rightBottom":
        return width - box_w - margin_x, height - box_h - margin_y

    return int((width - box_w) / 2), height - box_h - margin_y


def logo_position(position: str, width: int, height: int, logo_w: int, logo_h: int):
    margin_x = int(width * 0.07)
    margin_y = int(height * 0.08)

    if position == "top":
        return int((width - logo_w) / 2), margin_y

    if position == "center":
        return int((width - logo_w) / 2), int((height - logo_h) / 2)

    if position == "leftBottom":
        return margin_x, height - logo_h - margin_y

    if position == "rightBottom":
        return width - logo_w - margin_x, height - logo_h - margin_y

    return int((width - logo_w) / 2), height - logo_h - margin_y


def draw_text_overlay(
    width: int,
    height: int,
    text: str,
    font_size: int,
    position: str,
    font_color: str,
    font_weight: str,
    line_height: float,
    box_enabled: bool,
    box_color: str,
    box_opacity: float,
):
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    lines = safe_lines(text)

    if not lines:
        return overlay

    size = int(clamp_number(font_size, 42, 12, 180))
    font = load_font(size)

    line_gap = int(size * clamp_number(line_height, 1.25, 0.8, 2.5))
    padding_x = int(size * 0.85)
    padding_y = int(size * 0.65)

    measured_widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=max(2, int(size * 0.09)))
        measured_widths.append(bbox[2] - bbox[0])

    text_w = max(measured_widths) if measured_widths else int(width * 0.6)
    box_w = min(int(width * 0.90), max(int(width * 0.45), text_w + padding_x * 2))
    box_h = len(lines) * line_gap + padding_y * 2

    box_x, box_y = text_position(position, width, height, box_w, box_h)

    if box_enabled:
        bg = with_opacity(parse_hex_color(box_color, (0, 0, 0, 255)), clamp_number(box_opacity, 0.45, 0, 1))
        draw.rounded_rectangle(
            [box_x, box_y, box_x + box_w, box_y + box_h],
            radius=int(size * 0.45),
            fill=bg,
        )

    fill = parse_hex_color(font_color, (255, 255, 255, 255))
    stroke_w = max(2, int(size * 0.09))

    current_y = box_y + padding_y

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=stroke_w)
        tw = bbox[2] - bbox[0]
        x = box_x + int((box_w - tw) / 2)

        draw.text(
            (x, current_y),
            line,
            font=font,
            fill=fill,
            stroke_width=stroke_w,
            stroke_fill=(0, 0, 0, 255),
        )

        current_y += line_gap

    return overlay


async def paste_logo_if_needed(base: Image.Image, logo_url: str, logo_enabled: bool, logo_position_name: str, logo_width: int, logo_opacity: float, work_dir: Path):
    if not logo_enabled or not logo_url:
        return base

    logo_path = work_dir / "logo_input"
    await download_file(logo_url, logo_path)

    logo = Image.open(logo_path).convert("RGBA")

    target_w = int(clamp_number(logo_width, 140, 24, 600))
    ratio = target_w / max(1, logo.width)
    target_h = int(logo.height * ratio)

    logo = logo.resize((target_w, target_h), Image.LANCZOS)

    alpha = logo.getchannel("A")
    alpha = alpha.point(lambda p: int(p * clamp_number(logo_opacity, 0.9, 0, 1)))
    logo.putalpha(alpha)

    x, y = logo_position(logo_position_name, base.width, base.height, target_w, target_h)
    base.alpha_composite(logo, (x, y))

    return base


def run_simple_overlay(input_path: Path, overlay_path: Path, output_path: Path, seconds: float):
    duration = clamp_number(seconds, 6, 1, 20)

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-i",
        str(overlay_path),
        "-filter_complex",
        "[0:v][1:v]overlay=0:0[v]",
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        str(output_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"ffmpeg failed: {result.stderr}")

    if not output_path.exists() or output_path.stat().st_size <= 0:
        raise HTTPException(status_code=500, detail="焼き込み後動画が空です")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/burn-text-video")
async def burn_text_video(body: BurnRequest):
    work_dir = Path("/tmp") / f"burn-{uuid.uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        input_path = work_dir / "input.mp4"
        overlay_path = work_dir / "overlay.png"
        output_path = work_dir / "output.mp4"

        await download_file(body.videoUrl, input_path)

        width, height = ffprobe_size(input_path)

        y_percent = clamp_number(body.y, 70, 0, 100)
        position = "bottom"
        if y_percent <= 30:
            position = "top"
        elif 30 < y_percent < 65:
            position = "center"

        overlay = draw_text_overlay(
            width=width,
            height=height,
            text=body.text or "",
            font_size=int(clamp_number(body.fontSize, 48, 10, 200)),
            position=position,
            font_color="#FFFFFF",
            font_weight="bold",
            line_height=1.25,
            box_enabled=True,
            box_color="#000000",
            box_opacity=0.48,
        )

        overlay.save(overlay_path)

        run_simple_overlay(input_path, overlay_path, output_path, body.seconds or 6)

        return FileResponse(
            path=str(output_path),
            media_type="video/mp4",
            filename="burned.mp4",
        )
    finally:
        pass


@app.post("/cm-burn-overlay")
async def cm_burn_overlay(body: CmBurnRequest):
    work_dir = Path("/tmp") / f"cm-burn-{uuid.uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        input_path = work_dir / "input.mp4"
        overlay_path = work_dir / "overlay.png"
        output_path = work_dir / "output.mp4"

        await download_file(body.videoUrl, input_path)

        width, height = ffprobe_size(input_path)

        ov = body.overlay

        canvas = draw_text_overlay(
            width=width,
            height=height,
            text=ov.text or "",
            font_size=int(clamp_number(ov.fontSize, 42, 12, 180)),
            position=ov.position or "bottom",
            font_color=ov.fontColor or "#FFFFFF",
            font_weight=ov.fontWeight or "bold",
            line_height=ov.lineHeight or 1.25,
            box_enabled=ov.boxEnabled is not False,
            box_color=ov.boxColor or "#000000",
            box_opacity=clamp_number(ov.boxOpacity, 0.45, 0, 1),
        )

        canvas = await paste_logo_if_needed(
            base=canvas,
            logo_url=ov.logoUrl or "",
            logo_enabled=ov.logoEnabled is True,
            logo_position_name=ov.logoPosition or "top",
            logo_width=int(clamp_number(ov.logoWidth, 140, 24, 600)),
            logo_opacity=clamp_number(ov.logoOpacity, 0.9, 0, 1),
            work_dir=work_dir,
        )

        canvas.save(overlay_path)

        run_simple_overlay(input_path, overlay_path, output_path, body.seconds or 5)

        return FileResponse(
            path=str(output_path),
            media_type="video/mp4",
            filename="cm-burned.mp4",
        )
    finally:
        pass