// /components/video/NonAiVideoActions.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { auth, storage } from "@/firebase";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { generateNonAiVideoWebm } from "@/lib/nonAiVideo/generate";
import type { MotionCharacter } from "@/lib/types/draft";

type RenderMode = "auto" | "cloud" | "local";
type SourceMode = "image" | "video";
type VideoType = "auto_ad" | "spin" | "zoom" | "pan" | "showcase" | "reel";

type Props = {
  busy: boolean;
  reason: string;
  setReason: (s: string) => void;
  uid: string | null;
  draftId: string | null;
  brand: "vento" | "riva";
  vision: string;
  keywords: string[];
  preset: {
    id: string;
    major?: string;
    middle?: string;
    minor?: string;
    tempo: MotionCharacter["tempo"];
    reveal: MotionCharacter["reveal"];
    intensity: MotionCharacter["intensity"];
    attitude: MotionCharacter["attitude"];
    rhythm: MotionCharacter["rhythm"];
  } | null;
  sourceImageUrl?: string;
  sourceImageUrls?: string[];
  sourceLabel?: string;
  materialImageUrls?: string[];
  baseImageUrl?: string;
  backgroundImageUrl?: string;
  backgroundLabel?: string;
  sourceVideoUrl?: string;
  sourceVideoLabel?: string;
  seconds: 5 | 10;
  quality: "standard" | "high";
  size: string;
  onSave: (url: string) => void | Promise<void>;
  onSaveSourceVideo?: (args: { url: string; path: string }) => void | Promise<void>;
  onExtractProductVideoClip?: (args: {
    sourceVideoUrl: string;
    backgroundImageUrl: string;
  }) => void | Promise<void>;
};

function isLocalhost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
}

function isLocalRenderUiEnabled() {
  // localhost では開発確認のため Local Render を押せるようにします。
  // 実際にMP4化するにはMac側に ffmpeg が必要です。
  return isLocalhost() || process.env.NEXT_PUBLIC_AOI_FLOW_ENABLE_LOCAL_RENDER === "true";
}

function readSavedRenderMode(): RenderMode {
  if (typeof window === "undefined") return "auto";
  const v = String(window.localStorage.getItem("aoiFlowVideoRenderMode") || "auto").trim();
  if (v === "cloud" || v === "local") return v;
  return "auto";
}

function renderModeLabel(mode: RenderMode) {
  if (mode === "cloud") return "Cloud Render";
  if (mode === "local") return "Local Render";
  return "自動";
}

function renderModeDesc(mode: RenderMode) {
  if (mode === "cloud") return "SaaS本番用。Cloud Run側でMP4へ変換します。端末に依存しません。";
  if (mode === "local") return "開発者専用。自分のPCに入っているFFmpegでMP4へ変換します。";
  return "推奨。本番はCloud Render、Cloud未設定時はWEBM保存へ退避します。";
}

function videoTypeLabel(type: VideoType) {
  if (type === "spin") return "Spin 回転";
  if (type === "zoom") return "Zoom ズーム";
  if (type === "pan") return "Pan 横移動";
  if (type === "showcase") return "Showcase 見せ場構成";
  if (type === "reel") return "Instagram Reel";
  return "Auto Ad 自動広告";
}

function videoTypeDesc(type: VideoType) {
  if (type === "spin") return "複数方向写真のように、軽い回転感を優先します。";
  if (type === "zoom") return "商品へ寄って質感を見せます。静物・雑貨向き。";
  if (type === "pan") return "横に流して空間感を出します。背景あり画像向き。";
  if (type === "showcase") return "スピン・ズーム・パンを混ぜて広告らしく見せます。";
  if (type === "reel") return "縦動画向け。テンポよく見せるSNS用です。";
  return "推奨。商品画像に合わせて自然な広告動画に寄せます。";
}

function motionForVideoType(type: VideoType, fallback: MotionCharacter): MotionCharacter {
  if (type === "spin") return { ...fallback, tempo: "normal", reveal: "early", intensity: "balanced", rhythm: "continuous" };
  if (type === "zoom") return { ...fallback, tempo: "slow", reveal: "early", intensity: "calm", rhythm: "continuous" };
  if (type === "pan") return { ...fallback, tempo: "slow", reveal: "delayed", intensity: "calm", rhythm: "continuous" };
  if (type === "showcase") return { ...fallback, tempo: "normal", reveal: "early", intensity: "strong", rhythm: "continuous" };
  if (type === "reel") return { ...fallback, tempo: "sharp", reveal: "early", intensity: "strong", rhythm: "continuous" };
  return fallback;
}

function parseSize(size: string): { w: number; h: number } {
  const m = String(size || "").match(/^(\d+)\s*x\s*(\d+)$/i);
  return {
    w: m ? Math.max(1, Number(m[1])) : 720,
    h: m ? Math.max(1, Number(m[2])) : 1280,
  };
}

function safeStringify(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}


function GlowPill(props: {
  active: boolean;
  label: string;
  sub?: string;
  onClick: () => void;
  color?: "cyan" | "emerald" | "fuchsia";
  disabled?: boolean;
}) {
  const { active, label, sub, onClick, color = "cyan", disabled = false } = props;
  const activeTone =
    color === "fuchsia"
      ? "border-fuchsia-200/70 bg-fuchsia-300/14 text-white shadow-[0_0_18px_rgba(217,70,239,0.62),inset_0_0_14px_rgba(217,70,239,0.18)]"
      : color === "emerald"
        ? "border-emerald-200/70 bg-emerald-300/14 text-white shadow-[0_0_18px_rgba(45,212,191,0.62),inset_0_0_14px_rgba(45,212,191,0.18)]"
        : "border-cyan-200/70 bg-cyan-300/14 text-white shadow-[0_0_18px_rgba(34,211,238,0.62),inset_0_0_14px_rgba(34,211,238,0.18)]";
  const dotTone =
    color === "fuchsia"
      ? "bg-fuchsia-200 shadow-[0_0_10px_rgba(217,70,239,0.95)]"
      : color === "emerald"
        ? "bg-emerald-200 shadow-[0_0_10px_rgba(45,212,191,0.95)]"
        : "bg-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.95)]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "relative inline-flex min-h-[34px] shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left backdrop-blur-md transition-all duration-200 disabled:opacity-45",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]",
        active ? activeTone : "border-white/18 bg-slate-950/22 text-white/74 hover:border-white/30 hover:bg-white/10",
      ].join(" ")}
      aria-pressed={active}
    >
      <span className={["h-2 w-2 shrink-0 rounded-full", active ? dotTone : "bg-white/35"].join(" ")} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="whitespace-nowrap text-[12px] font-black tracking-wide">{label}</span>
        {sub ? <span className="mt-1 whitespace-nowrap text-[9px] font-bold opacity-70">{sub}</span> : null}
      </span>
    </button>
  );
}

export default function NonAiVideoActions(props: Props) {
  const [localBusy, setLocalBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [renderMode, setRenderMode] = useState<RenderMode>("auto");
  const [canUseLocalRender, setCanUseLocalRender] = useState(true);
  const [sourceMode, setSourceMode] = useState<SourceMode>("image");
  const [videoType, setVideoType] = useState<VideoType>("auto_ad");

  useEffect(() => {
    const localEnabled = isLocalRenderUiEnabled();
    setCanUseLocalRender(localEnabled);
    const saved = readSavedRenderMode();
    // Local Renderボタンは開発中の確認導線なので、localhostではもちろん、UI上は常に選べるようにします。
    // ffmpeg未導入の場合は生成時にWEBM保存へ退避し、失敗表示だけで終わらせません。
    setRenderMode(saved);
  }, []);

  function updateRenderMode(next: RenderMode) {
    const safeNext = next;
    setRenderMode(safeNext);
    try {
      window.localStorage.setItem("aoiFlowVideoRenderMode", safeNext);
    } catch {}
  }

  const savedImageUrl = String(props.sourceImageUrl || props.baseImageUrl || "").trim();
  const savedImageUrls = Array.isArray(props.sourceImageUrls)
    ? props.sourceImageUrls.map((url) => String(url || "").trim()).filter(Boolean)
    : [];
  const inputImageUrl = String(savedImageUrl || savedImageUrls[0] || "").trim();
  const inputImageLabel = props.sourceLabel || "選択済み画像";
  const inputVideoUrl = String(props.sourceVideoUrl || "").trim();
  const backgroundImageUrl = String(props.backgroundImageUrl || "").trim();

  const canRunStaticVideo = useMemo(() => {
    if (props.busy || localBusy) return false;
    if (!props.uid || !props.draftId) return false;
    if (!props.preset?.id) return false;
    if (!inputImageUrl) return false;
    return true;
  }, [props.busy, localBusy, props.uid, props.draftId, props.preset?.id, inputImageUrl]);

  async function getToken() {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("認証トークン取得に失敗しました。再ログインしてください");
    return token;
  }

  async function uploadProductVideo(file: File) {
    props.setReason("");
    setMsg("");

    if (!props.uid) {
      props.setReason("ログイン確認中です");
      return;
    }
    if (!props.draftId) {
      props.setReason("draftId がありません。先に保存してください");
      return;
    }

    setLocalBusy(true);
    try {
      if (file.size > 300 * 1024 * 1024) throw new Error("動画サイズが大きすぎます（300MB以下）");

      const originalName = String(file.name || "").toLowerCase();
      const ext = originalName.endsWith(".mov")
        ? "mov"
        : originalName.endsWith(".webm")
          ? "webm"
          : "mp4";

      const path = `users/${props.uid}/drafts/${props.draftId}/source/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file, { contentType: file.type || "video/mp4" });

      await new Promise<void>((resolve, reject) => {
        task.on("state_changed", () => {}, reject, () => resolve());
      });

      const url = await getDownloadURL(task.snapshot.ref);
      if (!url) throw new Error("動画URL取得に失敗しました");

      await props.onSaveSourceVideo?.({ url, path });
      setMsg("✅ 商品撮影動画を保存しました。背景合成が必要な場合は、背景画像を選んでから合成してください");

      if (backgroundImageUrl && typeof props.onExtractProductVideoClip === "function") {
        setMsg("🎬 商品撮影動画と背景を合成中...");
        await props.onExtractProductVideoClip({ sourceVideoUrl: url, backgroundImageUrl });
        setMsg("✅ 商品撮影動画＋背景合成が完了しました");
      }
    } catch (e: any) {
      props.setReason(e?.message || "商品撮影動画の保存に失敗しました");
    } finally {
      setLocalBusy(false);
    }
  }

  async function runStaticVideo() {
    if (!canRunStaticVideo) {
      if (!props.uid) props.setReason("ログイン確認中です");
      else if (!props.draftId) props.setReason("draftId がありません。先に保存してください");
      else if (!props.preset?.id) props.setReason("動画タイプを選択してください");
      else if (!inputImageUrl) props.setReason("動画化する商品画像がありません。上の『アップロード画像から選択』で商品写真を選んでください");
      else props.setReason("実行できません。状態を確認してください");
      return;
    }

    props.setReason("");
    setMsg("🎬 商品画像から広告動画を生成中です");
    setLocalBusy(true);

    try {
      const token = await getToken();
      const baseMotion: MotionCharacter = {
        tempo: props.preset!.tempo,
        reveal: props.preset!.reveal,
        intensity: props.preset!.intensity,
        attitude: props.preset!.attitude,
        rhythm: props.preset!.rhythm,
      };
      const motion = motionForVideoType(videoType, baseMotion);
      const { w, h } = parseSize(props.size);

      const selectedMaterials = [
        ...savedImageUrls.filter((url) => url && url !== inputImageUrl),
        ...(Array.isArray(props.materialImageUrls) ? props.materialImageUrls : []),
      ]
        .map((url) => String(url || "").trim())
        .filter((url, index, arr) => url && arr.indexOf(url) === index);

      const blob = await generateNonAiVideoWebm({
        primary: inputImageUrl,
        materials: selectedMaterials,
        seconds: props.seconds,
        size: { w, h },
        motion,
        videoType,
      });

      if (!blob || blob.size === 0) {
        props.setReason("WEBM生成に失敗しました（Blobが空です）");
        return;
      }

      const fd = new FormData();
      fd.append("draftId", props.draftId!);
      fd.append("kind", "generated");
      fd.append("seconds", String(props.seconds));
      fd.append("buttonId", `${String(props.preset!.id)}_${videoType}`);
      fd.append("videoType", videoType);
      fd.append("engine", "non-ai");
      fd.append("file", blob, `nonai_${Date.now()}_${props.seconds}s.webm`);

      setMsg("⬆️ 生成した動画を保存中です");
      const up = await fetch("/api/upload-video-webm", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const upj: any = await up.json().catch(() => ({}));
      if (!up.ok) {
        const detail = upj?.detail ? ` / detail: ${safeStringify(upj.detail)}` : "";
        props.setReason((upj?.error || "upload-video-webm failed") + detail);
        return;
      }

      const webmPath = String(upj?.path || "").trim();
      if (!webmPath) {
        props.setReason("アップロードは成功しましたが path が空です");
        return;
      }

      setMsg("🎞 MP4へ変換中です");
      const fin = await fetch("/api/finalize-nonai-mp4", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ draftId: props.draftId, webmPath, renderMode, videoType }),
      });
      const finj: any = await fin.json().catch(() => ({}));
      if (!fin.ok) {
        const webmUrl = String(upj?.url || upj?.videoUrl || "").trim();
        if (webmUrl) {
          // Cloud Run未設定・ローカルFFmpeg未導入でも、ブラウザで作ったWEBMは保存して使えるようにする。
          // MP4化はCloud Render設定後、または開発者PCにFFmpegを入れた後に再実行する。
          await props.onSave(webmUrl);
          props.setReason("");
          setMsg(
            `✅ 広告動画WEBMを保存しました（${props.seconds}秒）。MP4変換は未実行です。必要ならCloud Render設定後にMP4化できます。`
          );
          return;
        }

        props.setReason(`${renderModeLabel(renderMode)}でMP4変換に失敗しました：${String(finj?.error || "finalize-nonai-mp4 failed")}`);
        return;
      }

      const mp4Url =
        (typeof finj?.mp4Url === "string" && finj.mp4Url) ||
        (typeof finj?.url === "string" && finj.url) ||
        (typeof finj?.videoUrl === "string" && finj.videoUrl) ||
        "";
      if (!mp4Url) {
        props.setReason("mp4化は成功しましたが mp4Url が空です");
        return;
      }

      await props.onSave(mp4Url);
      setMsg(`✅ 広告動画(mp4)が完成しました（${props.seconds}秒 / ${renderModeLabel(renderMode)}）`);
    } catch (e: any) {
      props.setReason(e?.message || "広告動画の生成に失敗しました");
    } finally {
      setLocalBusy(false);
    }
  }

  const card = "rounded-xl border border-white/10 bg-black/15 p-3";

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-white/85 font-black text-xs">商品広告動画生成</div>
      <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
        商品画像または商品撮影動画から、Instagram / TikTok向けの広告動画を作ります。
        <br />尺：{props.seconds === 10 ? "10秒" : "5秒"} / 品質：{props.quality === "high" ? "高品質" : "標準"} / サイズ：{props.size}
      </div>

      <div className="mt-3 rounded-xl border border-white/14 bg-black/18 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-black text-white/85">レンダリング方式</div>
          <div className="rounded-full border border-cyan-200/45 bg-cyan-300/12 px-3 py-1 text-[10px] font-black text-cyan-50 shadow-[0_0_14px_rgba(34,211,238,0.45)]">
            現在：{renderModeLabel(renderMode)}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "auto" as const, label: "自動", desc: "推奨" },
            { id: "cloud" as const, label: "Cloud", desc: "本番" },
            { id: "local" as const, label: "Local", desc: "開発" },
          ].map((item) => (
            <GlowPill
              key={item.id}
              active={renderMode === item.id}
              label={item.label}
              sub={item.desc}
              color="cyan"
              disabled={false}
              onClick={() => updateRenderMode(item.id)}
            />
          ))}
        </div>
        <div className="mt-2 text-[10px] text-white/52" style={{ lineHeight: 1.5 }}>
          {renderModeDesc(renderMode)}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/14 bg-black/18 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-black text-white/85">動画の種類</div>
          <div className="rounded-full border border-emerald-200/45 bg-emerald-300/12 px-3 py-1 text-[10px] font-black text-emerald-50 shadow-[0_0_14px_rgba(45,212,191,0.45)]">
            現在：{videoTypeLabel(videoType)}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "auto_ad" as const, label: "Auto Ad", desc: "自動広告" },
            { id: "spin" as const, label: "Spin", desc: "回転" },
            { id: "zoom" as const, label: "Zoom", desc: "寄り" },
            { id: "pan" as const, label: "Pan", desc: "横移動" },
            { id: "showcase" as const, label: "Showcase", desc: "構成" },
            { id: "reel" as const, label: "IG Reel", desc: "SNS" },
          ].map((item) => (
            <GlowPill
              key={item.id}
              active={videoType === item.id}
              label={item.label}
              sub={item.desc}
              color="emerald"
              onClick={() => setVideoType(item.id)}
            />
          ))}
        </div>
        <div className="mt-2 text-[10px] text-white/52" style={{ lineHeight: 1.5 }}>
          {videoTypeDesc(videoType)}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/14 bg-black/18 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-black text-white/85">作り方</div>
          <div className="rounded-full border border-fuchsia-200/45 bg-fuchsia-300/12 px-3 py-1 text-[10px] font-black text-fuchsia-50 shadow-[0_0_14px_rgba(217,70,239,0.42)]">
            現在：{sourceMode === "image" ? "商品画像から作る" : "商品撮影動画から作る"}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "image" as const, label: "商品画像から作る", desc: "推奨" },
            { id: "video" as const, label: "商品撮影動画から作る", desc: "撮影動画" },
          ].map((item) => (
            <GlowPill
              key={item.id}
              active={sourceMode === item.id}
              label={item.label}
              sub={item.desc}
              color="fuchsia"
              onClick={() => setSourceMode(item.id)}
            />
          ))}
        </div>
      </div>

      {sourceMode === "image" ? (
        <div className={`mt-3 ${card}`}>
          <div className="text-white/75 text-xs font-black">商品画像</div>
          <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
            現在の画像：{inputImageUrl ? inputImageLabel : "未選択"}
            {savedImageUrls.length > 1 ? ` / 選択枚数：${savedImageUrls.length}枚` : ""}
          </div>
          {inputImageUrl ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2" style={{ maxHeight: 72, overflow: "hidden" }}>
              <img
                src={inputImageUrl}
                alt="selected product"
                className="shrink-0 rounded-lg border border-white/15 bg-black/30"
                style={{ width: 56, height: 56, maxWidth: 56, maxHeight: 56, objectFit: "cover", display: "block" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-black text-white/85">{inputImageLabel}</div>
                <div className="mt-1 text-[10px] text-white/50" style={{ lineHeight: 1.5 }}>
                  選択中の画像です。小型サムネイルだけ表示します。大画像プレビューは出しません。
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-950/15 px-3 py-2 text-[11px] text-cyan-50/75" style={{ lineHeight: 1.5 }}>
            画像追加は左側の通常アップロードで行います。ここでは追加アップロードせず、上の一覧で選んだ商品写真だけを動画化します。
          </div>
          <button
            type="button"
            disabled={!canRunStaticVideo}
            onClick={() => void runStaticVideo()}
            className="mt-3 rounded-full bg-white px-5 py-2 text-xs font-black text-black disabled:opacity-40"
          >
            ▶ 商品画像から広告動画を生成
          </button>
        </div>
      ) : (
        <div className={`mt-3 ${card}`}>
          <div className="text-white/75 text-xs font-black">商品撮影動画</div>
          <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
            現在の動画：{inputVideoUrl ? props.sourceVideoLabel || "選択済み" : "未選択"}
          </div>
          {inputVideoUrl ? <video src={inputVideoUrl} controls className="mt-3 w-full rounded-xl border border-white/10 bg-black" style={{ maxHeight: 260 }} /> : null}
          <div className="mt-3">
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              disabled={props.busy || localBusy}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                void uploadProductVideo(file);
              }}
              className="block w-full text-xs text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-black file:text-black disabled:opacity-40"
            />
          </div>
          <div className="mt-2 text-white/45 text-[11px]" style={{ lineHeight: 1.5 }}>
            背景画像：{backgroundImageUrl ? props.backgroundLabel || "選択済み" : "未選択"}。未選択でも動画の保存はできます。
          </div>
        </div>
      )}

      {props.reason ? <div className="mt-2 text-xs text-white/70">{props.reason}</div> : null}
      {msg ? <div className="mt-2 text-xs text-white/70">{msg}</div> : null}
    </div>
  );
}
