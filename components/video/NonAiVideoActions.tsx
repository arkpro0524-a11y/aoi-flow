// /components/video/NonAiVideoActions.tsx
"use client";

import React, { useMemo, useState } from "react";
import { auth } from "@/firebase";
import { generateNonAiVideoWebm } from "@/lib/nonAiVideo/generate";
import type { MotionCharacter } from "@/lib/types/draft";

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
  sourceLabel?: string;
  baseImageUrl?: string;

  backgroundImageUrl?: string;
  backgroundLabel?: string;

  sourceVideoUrl?: string;
  sourceVideoLabel?: string;

  seconds: 5 | 10;
  quality: "standard" | "high";
  size: string;

  onSave: (url: string) => void | Promise<void>;

  onSaveSourceVideo?: (args: {
    url: string;
    path: string;
  }) => void | Promise<void>;
};

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

export default function NonAiVideoActions(props: Props) {
  const [localBusy, setLocalBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const inputImageUrl = String(props.sourceImageUrl || props.baseImageUrl || "").trim();
  const inputVideoUrl = String(props.sourceVideoUrl || "").trim();
  const backgroundImageUrl = String(props.backgroundImageUrl || "").trim();

  const canRunStaticVideo = useMemo(() => {
    if (props.busy) return false;
    if (localBusy) return false;
    if (!props.uid) return false;
    if (!props.draftId) return false;
    if (!props.preset?.id) return false;
    if (!inputImageUrl) return false;
    return true;
  }, [props.busy, localBusy, props.uid, props.draftId, props.preset?.id, inputImageUrl]);

  async function getToken() {
    const token = await auth.currentUser?.getIdToken(true);

    if (!token) {
      throw new Error("認証トークン取得に失敗しました。再ログインしてください");
    }

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
      const token = await getToken();

      const fd = new FormData();
      fd.append("draftId", props.draftId);
      fd.append("kind", "source");
      fd.append("file", file, file.name || `source_${Date.now()}.mp4`);

      const res = await fetch("/api/upload-video-webm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });

      const j: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = j?.detail ? ` / detail: ${safeStringify(j.detail)}` : "";
        throw new Error((j?.error || "商品動画アップロードに失敗しました") + detail);
      }

      const url = String(j?.url || j?.videoUrl || "").trim();
      const path = String(j?.path || "").trim();

      if (!url || !path) {
        throw new Error("アップロードは成功しましたが url/path が空です");
      }

      await props.onSaveSourceVideo?.({ url, path });

      setMsg("✅ 商品撮影動画を保存しました");
    } catch (e: any) {
      props.setReason(e?.message || "商品撮影動画の保存に失敗しました");
    } finally {
      setLocalBusy(false);
    }
  }

  async function runStaticVideo() {
    if (!canRunStaticVideo) {
      if (!props.uid) {
        props.setReason("ログイン確認中です");
      } else if (!props.draftId) {
        props.setReason("draftId がありません。先に保存してください");
      } else if (!props.preset?.id) {
        props.setReason("動画テンプレを選択してください");
      } else if (!inputImageUrl) {
        props.setReason("動画化する画像がありません。合成画像またはAI静止画を先に用意してください");
      } else {
        props.setReason("実行できません。状態を確認してください");
      }

      return;
    }

    props.setReason("");
    setMsg("");
    setLocalBusy(true);

    try {
      const token = await getToken();

      const motion: MotionCharacter = {
        tempo: props.preset!.tempo,
        reveal: props.preset!.reveal,
        intensity: props.preset!.intensity,
        attitude: props.preset!.attitude,
        rhythm: props.preset!.rhythm,
      };

      const { w, h } = parseSize(props.size);

      const blob = await generateNonAiVideoWebm({
        primary: inputImageUrl,
        materials: [],
        seconds: props.seconds,
        size: { w, h },
        motion,
      });

      if (!blob || blob.size === 0) {
        props.setReason("WEBM生成に失敗しました（Blobが空です）");
        return;
      }

      const fd = new FormData();
      fd.append("draftId", props.draftId!);
      fd.append("kind", "generated");
      fd.append("seconds", String(props.seconds));
      fd.append("buttonId", String(props.preset!.id));
      fd.append("engine", "non-ai");
      fd.append("file", blob, `nonai_${Date.now()}_${props.seconds}s.webm`);

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

      const fin = await fetch("/api/finalize-nonai-mp4", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId: props.draftId,
          webmPath,
        }),
      });

      const finj: any = await fin.json().catch(() => ({}));

      if (!fin.ok) {
        props.setReason(String(finj?.error || "finalize-nonai-mp4 failed"));
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

      setMsg(`✅ 静止画ベース動画(mp4)が完成しました（${props.seconds}秒）`);
    } catch (e: any) {
      props.setReason(e?.message || "非AI動画の生成に失敗しました");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-white/85 font-black text-xs">商品動画制作</div>

      <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
        尺：{props.seconds === 10 ? "10秒" : "5秒"} / 品質：
        {props.quality === "high" ? "高品質" : "標準"} / サイズ：{props.size}
      </div>

      <div className="mt-3 rounded-xl border border-cyan-400/20 bg-black/20 p-3">
        <div className="text-cyan-200 text-xs font-black">新方式：商品を撮った動画から作る</div>

        <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
          商品対象物の動画をアップロードします。背景合成は上部の「動画切り抜き（背景合成）」ボタンから実行します。
        </div>

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

        <div className="mt-3 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
          商品撮影動画：{inputVideoUrl ? "選択済み" : "未選択"}
        </div>

        <div className="mt-1 text-white/45 text-[11px]">
          {inputVideoUrl ? "保存済みの商品撮影動画を使用します" : "まだ商品撮影動画がありません"}
        </div>

        <div className="mt-3 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
          合成背景：{backgroundImageUrl ? props.backgroundLabel || "選択済み" : "未選択"}
        </div>

        <div className="mt-1 text-white/45 text-[11px]">
          {backgroundImageUrl ? "選択中の背景画像を使用します" : "まだ背景画像がありません"}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="text-white/75 text-xs font-black">従来方式：静止画から安全に動画化</div>

        <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.6 }}>
          使用画像：{inputImageUrl ? props.sourceLabel || "選択済み" : "未選択"}
        </div>

        <div className="mt-1 text-white/45 text-[11px]">
          {inputImageUrl ? "選択中の静止画を使用します" : "まだ画像がありません"}
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled={!canRunStaticVideo}
            onClick={() => void runStaticVideo()}
            className="rounded-full bg-white px-5 py-2 text-xs font-black text-black disabled:opacity-40"
            title="現在の尺・品質・サイズ設定で静止画ベースの商品動画を生成します"
          >
            ▶ 静止画から生成（{props.seconds === 10 ? "10秒" : "5秒"} / mp4）
          </button>
        </div>
      </div>

      {props.reason ? <div className="mt-2 text-xs text-white/70">{props.reason}</div> : null}
      {msg ? <div className="mt-2 text-xs text-white/70">{msg}</div> : null}
    </div>
  );
}