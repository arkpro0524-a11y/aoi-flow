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
    major: string;
    middle: string;
    minor: string;
    tempo: MotionCharacter["tempo"];
    reveal: MotionCharacter["reveal"];
    intensity: MotionCharacter["intensity"];
    attitude: MotionCharacter["attitude"];
    rhythm: MotionCharacter["rhythm"];
  } | null;

  sourceImageUrl?: string;
  baseImageUrl?: string;

  seconds: 5 | 10;
  quality: "standard" | "high";
  size: string;

  onSave: (url: string) => void | Promise<void>;
};

function parseSize(size: string): { w: number; h: number } {
  const m = String(size || "").match(/^(\d+)\s*x\s*(\d+)$/i);
  const w = m ? Math.max(1, Number(m[1])) : 1024;
  const h = m ? Math.max(1, Number(m[2])) : 1792;
  return { w, h };
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

  const canRun = useMemo(() => {
    if (props.busy) return false;
    if (localBusy) return false;
    if (!props.uid) return false;
    if (!props.draftId) return false;
    if (!props.preset?.id) return false;
    if (!inputImageUrl) return false;
    if (!props.vision?.trim()) return false;
    return true;
  }, [props.busy, localBusy, props.uid, props.draftId, props.preset?.id, inputImageUrl, props.vision]);

  async function run() {
    if (!canRun) {
      if (!props.uid) props.setReason("ログイン確認中です");
      else if (!props.draftId) props.setReason("draftId がありません（先に保存して）");
      else if (!props.preset?.id) props.setReason("動画ボタン（人格）を選択してください");
      else if (!inputImageUrl) props.setReason("動画化する画像がありません（合成/動画用 を保存して）");
      else if (!props.vision?.trim()) props.setReason("Vision（必須）を入力してください");
      else props.setReason("実行できません（状態を確認してください）");
      return;
    }

    props.setReason("");
    setMsg("");
    setLocalBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        props.setReason("認証トークン取得に失敗しました（再ログインしてください）");
        return;
      }

      const motion: MotionCharacter = {
        tempo: props.preset!.tempo,
        reveal: props.preset!.reveal,
        intensity: props.preset!.intensity,
        attitude: props.preset!.attitude,
        rhythm: props.preset!.rhythm,
      };

      const { w, h } = parseSize(props.size);

      // 1) webm生成（クライアント）
      const blob = await generateNonAiVideoWebm({
        primary: inputImageUrl,
        materials: [],
        seconds: props.seconds,
        size: { w, h },
        motion,
      });

      if (!blob || blob.size === 0) {
        props.setReason("webm 生成に失敗（Blobが空）");
        return;
      }

      // 2) upload（Storageへ）
      const fd = new FormData();
      fd.append("draftId", props.draftId!);
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

      const webmPath: string = String(upj?.path || "").trim();
      if (!webmPath) {
        props.setReason("アップロード成功したが path が空（upload-video-webm の返却を確認して）");
        return;
      }

      // 3) finalize（サーバでmp4化）
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

      const mp4Url: string =
        (typeof finj?.mp4Url === "string" && finj.mp4Url) ||
        (typeof finj?.url === "string" && finj.url) ||
        (typeof finj?.videoUrl === "string" && finj.videoUrl) ||
        "";

      if (!mp4Url) {
        props.setReason("mp4化は成功したが mp4Url が空（API返却を確認して）");
        return;
      }

      // 4) drafts更新は既存の唯一ルート（page.tsx内 saveNonAiVideoToDraft 経由）
      await props.onSave(mp4Url);

      setMsg(`✅ 非AI動画(mp4)が完成しました（${props.seconds}秒）`);
    } catch (e: any) {
      props.setReason(e?.message || "非AI動画（webm→mp4）の処理に失敗しました");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 mt-2">
      <div className="text-white/80 font-black text-xs">非AI動画（webm生成 → upload → mp4化 → 保存）</div>

      <div className="mt-2 text-white/60 text-xs" style={{ lineHeight: 1.5 }}>
        尺：{props.seconds === 10 ? "10秒" : "5秒"} / 品質：
        {props.quality === "high" ? "高品質" : "標準"} / サイズ：{props.size}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canRun}
          onClick={run}
          className="rounded-full px-5 py-2 text-xs font-black bg-white text-black disabled:opacity-40"
          title="現在の尺/品質/サイズ設定で非AI動画を生成します（mp4で保存）"
        >
          ▶ 非AIで生成（{props.seconds === 10 ? "10秒" : "5秒"} / mp4）
        </button>
      </div>

      {props.reason ? <div className="mt-2 text-xs text-white/70">{props.reason}</div> : null}
      {msg ? <div className="mt-2 text-xs text-white/70">{msg}</div> : null}
    </div>
  );
}