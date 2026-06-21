// /lib/nonAiVideo/generate.ts

export type NonAiVideoInput = {
  /** 代表画像（必須・1枚） */
  primary: string;

  /** 素材画像（0〜複数・順序あり） */
  materials?: string[];

  seconds: 5 | 10;
  size: { w: number; h: number };
  motion: {
    tempo: "slow" | "normal" | "sharp" | "fast";
    reveal: "early" | "delayed" | "last" | "late";
    intensity: "calm" | "balanced" | "strong" | "subtle";
    attitude: "humble" | "neutral" | "assertive";
    rhythm: "with_pause" | "continuous" | "wave" | "beat";
  };
  videoType?: "auto_ad" | "spin" | "zoom" | "pan" | "showcase" | "reel";
  textLines?: string[];
  /**
   * 商品切り抜きPNGの背面へ直接敷く静止背景です。
   * 動画化後にcutoutせず、Canvas上で「背景固定＋商品だけ動く」構成にします。
   */
  backgroundImageUrl?: string;
  /**
   * 旧方式のクロマキー用。商品広告画像モードでは使わず、互換用に残します。
   */
  chromaBackground?: boolean;
};

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function toCanvasSafeUrl(url: string): Promise<string> {
  const safeUrl = String(url || "").trim();

  if (!safeUrl) throw new Error("画像URLが空です");
  if (safeUrl.startsWith("blob:") || safeUrl.startsWith("data:")) return safeUrl;
  if (!/^https?:\/\//i.test(safeUrl)) return safeUrl;

  const res = await fetch("/api/proxy-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: safeUrl }),
  });

  const blob = await res.blob().catch(() => null);

  if (!res.ok || !blob || blob.size === 0) {
    throw new Error(`画像の読み込みに失敗しました: ${safeUrl}`);
  }

  return URL.createObjectURL(blob);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = await toCanvasSafeUrl(url);
  await new Promise<void>((ok, ng) => {
    img.onload = () => ok();
    img.onerror = () => ng(new Error(`画像の読み込みに失敗しました: ${url}`));
  });
  return img;
}


function coverRect(img: HTMLImageElement, w: number, h: number, scale = 1) {
  // 画像をキャンバス全体に自然に敷き詰めるための基本計算。
  // ここを共通化すると、縦長/横長どちらの写真でも左右に変な揺れが出にくくなる。
  const base = Math.max(w / img.width, h / img.height) * scale;
  const dw = img.width * base;
  const dh = img.height * base;
  return { dw, dh, dx: (w - dw) / 2, dy: (h - dh) / 2 };
}

function containRect(img: HTMLImageElement, w: number, h: number, scale = 1) {
  // 商品単体の透明PNGなどは切らずに見せたいので contain を使う。
  const base = Math.min(w / img.width, h / img.height) * scale;
  const dw = img.width * base;
  const dh = img.height * base;
  return { dw, dh, dx: (w - dw) / 2, dy: (h - dh) / 2 };
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  rotation = 0
) {
  const r = coverRect(img, w, h, scale);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rotation);
  ctx.drawImage(img, -r.dw / 2 + offsetX, -r.dh / 2 + offsetY, r.dw, r.dh);
  ctx.restore();
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  rotation = 0,
  flipScaleX = 1
) {
  const r = containRect(img, w, h, scale);
  ctx.save();
  ctx.translate(w / 2 + offsetX, h / 2 + offsetY);
  ctx.rotate(rotation);
  ctx.scale(flipScaleX, 1);
  ctx.drawImage(img, -r.dw / 2, -r.dh / 2, r.dw, r.dh);
  ctx.restore();
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
  const backgroundImage = input.backgroundImageUrl ? await loadImage(input.backgroundImageUrl) : null;
  const hasStaticBackground = !!backgroundImage;
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

    // 背景画像が選ばれている場合は、動画cutoutを使わず、
    // Canvas上で「固定背景＋切り抜き済み商品PNG」を直接合成します。
    if (backgroundImage) {
      drawCoverImage(ctx, backgroundImage, w, h, 1, 0, 0, 0);
    } else if (input.chromaBackground) {
      // 旧互換：クロマキー用グリーン背景。
      ctx.fillStyle = "#38A88E";
      ctx.fillRect(0, 0, w, h);
    } else {
      // 通常動画では背景を薄く敷く。透明PNGや商品単体でも真っ黒画面にしない。
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#071525");
      bg.addColorStop(1, "#0f2a3f");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }

    const oneImage = imageCount === 1;
    const videoType = input.videoType ?? "auto_ad";

    if (oneImage && videoType === "spin") {
      // 単品Spin：左右に揺らすだけではなく、画像そのものを中心から回す。
      // 商品切り抜きPNGでも破綻しにくいように contain で描画する。
      const angle = tt * Math.PI * 2;
      const flip = 0.72 + 0.28 * Math.abs(Math.cos(angle));
      drawContainImage(ctx, img, w, h, 0.82, 0, 0, angle, flip);
    } else if (oneImage && videoType === "zoom") {
      // 単品Zoom：商品へ自然に寄る。
      const scale = 1.0 + move * 1.7 * tt;
      drawContainImage(ctx, img, w, h, scale, 0, 0, 0);
    } else if (oneImage && videoType === "pan") {
      // 単品Pan：背景固定合成用では商品だけを動かしたいので contain を使う。
      const scale = (input.chromaBackground || hasStaticBackground) ? 0.92 + move * tt : 1.06 + move * tt;
      const ox = (tt - 0.5) * w * 0.12;
      const oy = (0.5 - tt) * h * 0.06;
      if (input.chromaBackground || hasStaticBackground) {
        drawContainImage(ctx, img, w, h, scale, ox, oy, 0);
      } else {
        drawCoverImage(ctx, img, w, h, scale, ox, oy, 0);
      }
    } else {
      // Canva風のKen Burns。複数画像では各写真が自然に拡大・移動しながら切り替わる。
      const direction = imageIndex % 2 === 0 ? 1 : -1;
      const scale = 1.04 + move * tt;
      const ox = direction * (tt - 0.5) * w * 0.08;
      const oy = -direction * (tt - 0.5) * h * 0.05;
      const rot = oneImage ? direction * (tt - 0.5) * 0.035 : direction * (tt - 0.5) * 0.02;
      if (input.chromaBackground || hasStaticBackground) {
        drawContainImage(ctx, img, w, h, 0.88 + move * tt, ox, oy, rot);
      } else {
        drawCoverImage(ctx, img, w, h, scale, ox, oy, rot);
      }

      // 複数画像の切替時は軽くフェード。
      if (!oneImage && localT < 0.12 && imageIndex > 0) {
        ctx.fillStyle = `rgba(0,0,0,${(0.12 - localT) / 0.12 * 0.28})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (!oneImage && localT > 0.88 && imageIndex < imageCount - 1) {
        ctx.fillStyle = `rgba(0,0,0,${(localT - 0.88) / 0.12 * 0.28})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // 雰囲気レイヤー。クロマキー背景では緑を汚すと抜けないため適用しません。
    if (!input.chromaBackground && !hasStaticBackground) {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, w, h);
    }

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