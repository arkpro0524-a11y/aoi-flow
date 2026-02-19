// /lib/nonAiVideo/generate.ts

export type NonAiVideoInput = {
  /** 代表画像（必須・1枚） */
  primary: string;

  /** 素材画像（0〜複数・順序あり） */
  materials?: string[];

  seconds: 5 | 10;
  size: { w: number; h: number };
  motion: {
    tempo: "slow" | "normal" | "sharp";
    reveal: "early" | "delayed" | "last";
    intensity: "calm" | "balanced" | "strong";
    attitude: "humble" | "neutral" | "assertive";
    rhythm: "with_pause" | "continuous";
  };
  textLines?: string[];
};

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise<void>((ok, ng) => {
    img.onload = () => ok();
    img.onerror = () => ng(new Error("failed to load image"));
  });
  return img;
}

function pickMimeType(): string {
  // ✅ 互換優先：vp8 を第一候補に（vp9は環境によって重くなりがち）
  const candidates = [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  for (const c of candidates) {
    // @ts-ignore
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "video/webm";
}

export async function generateNonAiVideoWebm(input: NonAiVideoInput): Promise<Blob> {
  const { w, h } = input.size;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas not supported");

  /** ✅ 描画シーケンス（primary → materials 順） */
  const sequenceUrls = [input.primary, ...(input.materials ?? [])];

  /** 画像をすべて事前ロード（順序保持） */
  const images = await Promise.all(sequenceUrls.map(loadImage));
  const imageCount = images.length;

  // ✅ fpsを落とす（最重要）
  const fps = 24;

  const totalFrames = input.seconds * fps;
  const framesPerImage = Math.floor(totalFrames / imageCount);

  const stream = canvas.captureStream(fps);

  // ✅ bitrate固定（暴発して巨大化するのを防ぐ）
  // - 720x1280 / 24fps / 10s でも耐えやすい
  // - 必要なら後で 1_200_000〜2_000_000 で調整
  const videoBitsPerSecond = Math.max(600_000, Math.min(2_200_000, Math.floor((w * h * fps) / 250)));

  const mimeType = pickMimeType();

  const rec = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
  });

  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // テンポで動き量を変える（非AI演出）
  const move =
    input.motion.tempo === "slow" ? 0.06 : input.motion.tempo === "normal" ? 0.1 : 0.16;

  // 強さでコントラストっぽい演出
  const alpha =
    input.motion.intensity === "calm" ? 0.06 : input.motion.intensity === "balanced" ? 0.1 : 0.16;

  // reveal（見せ方）
  const revealStart =
    input.motion.reveal === "early" ? 0.0 : input.motion.reveal === "delayed" ? 0.25 : 0.6;

  // ✅ timeslice なし（チャンク乱発を防ぐ）
  rec.start();

  for (let f = 0; f < totalFrames; f++) {
    const tGlobal = totalFrames <= 1 ? 1 : f / (totalFrames - 1);

    const imageIndex = Math.min(Math.floor(f / framesPerImage), imageCount - 1);
    const img = images[imageIndex];

    const localFrameStart = imageIndex * framesPerImage;
    const localT =
      framesPerImage > 0 ? Math.min(1, (f - localFrameStart) / framesPerImage) : 1;

    const tt = easeInOut(localT);

    ctx.clearRect(0, 0, w, h);

    // Ken Burns
    const scale = 1 + move * tt;
    const sw = w / scale;
    const sh = h / scale;

    const panX = (Math.sin(tt * Math.PI * 2) * 0.5 + 0.5) * (img.width - sw);
    const panY = (Math.cos(tt * Math.PI * 2) * 0.5 + 0.5) * (img.height - sh);

    ctx.drawImage(img, panX, panY, sw, sh, 0, 0, w, h);

    // 雰囲気レイヤー
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, w, h);

    // テキスト（primary区間のみ表示）
    if (imageIndex === 0 && input.textLines?.length) {
      const a = tGlobal < revealStart ? 0 : Math.min(1, (tGlobal - revealStart) / 0.15);

      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "bold 44px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const pad = 60;
      let y = h - pad - input.textLines.length * 56;
      for (const line of input.textLines.slice(0, 3)) {
        ctx.fillText(line, pad, y);
        y += 56;
      }
      ctx.globalAlpha = 1;
    }

    if (input.motion.rhythm === "with_pause") {
      if (tGlobal > 0.46 && tGlobal < 0.54) {
        for (let k = 0; k < 6; k++) {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
      }
    }

    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }

  await new Promise<void>((ok) => {
    rec.onstop = () => ok();
    rec.stop();
  });

  return new Blob(chunks, { type: "video/webm" });
}