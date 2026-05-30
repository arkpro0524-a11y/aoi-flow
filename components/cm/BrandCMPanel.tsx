// components/cm/BrandCMPanel.tsx
// 全張り替え

"use client";

import React, { useEffect, useRef, useState } from "react";
import { auth } from "@/firebase";
import type {
  CmOverlay,
  CmOverlayPosition,
  CmVideo,
  CmVideoPersona,
  CmVideoStatus,
  UiVideoSize,
  VideoQuality,
  VideoSeconds,
} from "@/lib/types/draft";

export type BrandCMPanelProps = {
  uid: string | null;
  draftId: string | null;
  idToken: string | null;
  brandId: string;
  saveDraft: (partial?: any) => Promise<any>;
  initial?: {
    philosophy?: string;
    keywordsText?: string;
    emotion?: string;
    purpose?: string;
    worldSpecText?: string;
    cmVideo?: Partial<CmVideo>;
    runwayTaskId?: string;
    runwayStatus?: any;
    runwayVideoUrl?: string;
  };
  busy?: boolean;
  showMsg?: (s: string) => void;
};

const COLOR_PRESETS = [
  {
    name: "迷ったらこれ",
    fontColor: "#FFFFFF",
    boxColor: "#000000",
    boxOpacity: 0.35,
    memo: "白文字＋黒背景帯。ほぼ失敗しにくい基本形。",
  },
  {
    name: "アンティーク",
    fontColor: "#F5E6C8",
    boxColor: "#2A1B12",
    boxOpacity: 0.45,
    memo: "木・革・真鍮・古道具系に合う温かい配色。",
  },
  {
    name: "高級感",
    fontColor: "#D8C48A",
    boxColor: "#0B0B0B",
    boxOpacity: 0.42,
    memo: "金色寄りの文字。ブランドCM向き。",
  },
  {
    name: "AIRA / AOI",
    fontColor: "#EAF6FF",
    boxColor: "#0F1E30",
    boxOpacity: 0.36,
    memo: "青みのある落ち着いた配色。",
  },
  {
    name: "柔らかい白",
    fontColor: "#FFF7EA",
    boxColor: "#3A2A1D",
    boxOpacity: 0.32,
    memo: "真っ白が浮くときに使いやすい。",
  },
  {
    name: "背景帯なし",
    fontColor: "#FFFFFF",
    boxColor: "#000000",
    boxOpacity: 0,
    memo: "映像が暗めで、文字だけでも読める時用。",
  },
];

function safeText(v: any) {
  return String(v ?? "").trim();
}

async function getFreshToken(fallbackToken: string | null) {
  const fresh = await auth.currentUser?.getIdToken(true).catch(() => "");
  return safeText(fresh) || safeText(fallbackToken);
}

function normalizeStatus(v: any): CmVideoStatus {
  const s = safeText(v);
  if (s === "idle") return "idle";
  if (s === "queued") return "queued";
  if (s === "running") return "running";
  if (s === "done") return "done";
  if (s === "error") return "error";
  if (s === "succeeded" || s === "completed") return "done";
  if (s === "failed") return "error";
  if (s === "designed") return "idle";
  return s ? "running" : "idle";
}

function normalizeSize(v: any): UiVideoSize {
  const s = safeText(v);
  if (s === "1280x720") return "1280x720";
  if (s === "960x960") return "960x960";
  return "720x1280";
}

function normalizeSeconds(v: any): VideoSeconds {
  return Number(v) === 10 ? 10 : 5;
}

function normalizeQuality(v: any): VideoQuality {
  return v === "high" ? "high" : "standard";
}

function normalizePosition(v: any): CmOverlayPosition {
  const s = safeText(v);
  if (s === "top") return "top";
  if (s === "center") return "center";
  if (s === "leftBottom") return "leftBottom";
  if (s === "rightBottom") return "rightBottom";
  return "bottom";
}

function uniqPushFront(arr: string[], url: string) {
  const u = safeText(url);
  if (!u) return arr;
  return [u, ...arr.filter((x) => safeText(x) && safeText(x) !== u)].slice(0, 10);
}

function buildPersona(input?: Partial<CmVideoPersona> | null): CmVideoPersona {
  return {
    seconds: normalizeSeconds(input?.seconds),
    quality: normalizeQuality(input?.quality),
    template: safeText(input?.template) || "brand_cm_worldspec",
    size: normalizeSize(input?.size),
  };
}

function buildOverlay(input?: Partial<CmOverlay> | null): CmOverlay {
  return {
    text: safeText(input?.text),
    logoUrl: safeText(input?.logoUrl),

    startSec: Number.isFinite(Number(input?.startSec)) ? Number(input?.startSec) : 0.3,
    endSec: Number.isFinite(Number(input?.endSec)) ? Number(input?.endSec) : 4.5,
    fadeInSec: Number.isFinite(Number(input?.fadeInSec)) ? Number(input?.fadeInSec) : 0.4,
    fadeOutSec: Number.isFinite(Number(input?.fadeOutSec)) ? Number(input?.fadeOutSec) : 0.6,

    position: normalizePosition(input?.position),

    fontSize: Number.isFinite(Number(input?.fontSize)) ? Number(input?.fontSize) : 42,
    fontColor: safeText(input?.fontColor) || "#FFFFFF",
    fontWeight: input?.fontWeight === "bold" ? "bold" : "normal",
    lineHeight: Number.isFinite(Number(input?.lineHeight)) ? Number(input?.lineHeight) : 1.25,

    boxEnabled: input?.boxEnabled !== false,
    boxColor: safeText(input?.boxColor) || "#000000",
    boxOpacity: Number.isFinite(Number(input?.boxOpacity)) ? Number(input?.boxOpacity) : 0.35,

    logoEnabled: input?.logoEnabled === true,
    logoPosition: normalizePosition(input?.logoPosition),
    logoWidth: Number.isFinite(Number(input?.logoWidth)) ? Number(input?.logoWidth) : 140,
    logoOpacity: Number.isFinite(Number(input?.logoOpacity)) ? Number(input?.logoOpacity) : 0.9,
  };
}

function buildDownloadFileName(brandId: string, draftId: string | null) {
  const brand = safeText(brandId) || "brand";
  const id = safeText(draftId) || "cm";
  return `${brand}-cm-${id}.mp4`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-black text-white/80">{children}</div>;
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 text-[11px] text-white/45" style={{ lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function LiveColorPicker(props: {
  label: string;
  color: string;
  opacity?: number;
  showOpacity?: boolean;
  onColorChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
}) {
  const opacity = Number.isFinite(Number(props.opacity)) ? Number(props.opacity) : 1;

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 text-xs font-black text-white/80">{props.label}</div>

      <div className="grid grid-cols-[52px_1fr] gap-3 items-center">
        <input
          type="color"
          value={props.color || "#FFFFFF"}
          onChange={(e) => props.onColorChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-white/20 bg-transparent"
        />

        <input
          value={props.color}
          onChange={(e) => props.onColorChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
          placeholder="#FFFFFF"
        />
      </div>

      {props.showOpacity ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-white/50">
            <span>透明</span>
            <span>{opacity.toFixed(2)}</span>
            <span>濃い</span>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => props.onOpacityChange?.(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>
      ) : null}
    </div>
  );
}

export default function BrandCMPanel(props: BrandCMPanelProps) {
  const { uid, draftId, idToken, brandId, saveDraft, initial, busy, showMsg } = props;

  const [philosophy, setPhilosophy] = useState(safeText(initial?.philosophy));
  const [keywordsText, setKeywordsText] = useState(safeText(initial?.keywordsText));
  const [emotion, setEmotion] = useState(safeText(initial?.emotion));
  const [purpose, setPurpose] = useState(safeText(initial?.purpose));

  const [heroSubject, setHeroSubject] = useState("");
  const [visualDirection, setVisualDirection] = useState("");
  const [brandMessage, setBrandMessage] = useState("");

  const [worldSpecText, setWorldSpecText] = useState(safeText(initial?.worldSpecText));
  const [reason, setReason] = useState("");
  const [showColorGuide, setShowColorGuide] = useState(false);
  const [previewColorPreset, setPreviewColorPreset] =
  useState<(typeof COLOR_PRESETS)[number] | null>(null);

  const initCmVideo: Partial<CmVideo> = { ...(initial?.cmVideo || {}) };

  const legacyTaskId = safeText(initial?.runwayTaskId);
  const legacyUrl = safeText(initial?.runwayVideoUrl);
  const legacyStatus = normalizeStatus(initial?.runwayStatus);

  const [taskId, setTaskId] = useState(safeText(initCmVideo.taskId) || legacyTaskId);
  const [status, setStatus] = useState<CmVideoStatus>(
    normalizeStatus(initCmVideo.status) !== "idle"
      ? normalizeStatus(initCmVideo.status)
      : legacyStatus
  );

const [originalCmUrl, setOriginalCmUrl] = useState(safeText(initCmVideo.url) || legacyUrl);
const [overlayUrl, setOverlayUrl] = useState(safeText(initCmVideo.overlayUrl));

const [selectedOriginalHistoryUrl, setSelectedOriginalHistoryUrl] = useState(
  safeText(initCmVideo.url) || legacyUrl
);

const [selectedOverlayHistoryUrl, setSelectedOverlayHistoryUrl] = useState(
  safeText(initCmVideo.overlayUrl)
);

const [videoUrl, setVideoUrl] = useState(
  safeText(initCmVideo.overlayUrl) || safeText(initCmVideo.url) || legacyUrl
);

const [hiddenOriginalUrls, setHiddenOriginalUrls] = useState<string[]>([]);
const [hiddenOverlayUrls, setHiddenOverlayUrls] = useState<string[]>([]);

const [overlayUrls, setOverlayUrls] = useState<string[]>(
  Array.isArray(initCmVideo.overlayUrls)
    ? initCmVideo.overlayUrls.map((x: any) => safeText(x)).filter(Boolean).slice(0, 10)
    : []
);

const adminUids = String(process.env.NEXT_PUBLIC_ADMIN_UIDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const isAdmin = !!uid && adminUids.includes(uid);

  const [urls, setUrls] = useState<string[]>(
    Array.isArray(initCmVideo.urls)
      ? initCmVideo.urls.map((x) => safeText(x)).filter(Boolean).slice(0, 10)
      : legacyUrl
        ? [legacyUrl]
        : []
  );

  const [persona, setPersona] = useState<CmVideoPersona | null>(
    initCmVideo.persona ? buildPersona(initCmVideo.persona) : buildPersona(null)
  );

  const [overlay, setOverlay] = useState<CmOverlay>(buildOverlay(initCmVideo.overlay));

  const [localBusy, setLocalBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [burnBusy, setBurnBusy] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBusy = !!busy || localBusy || burnBusy;

  function stopPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

function applyColorPreset(preset: (typeof COLOR_PRESETS)[number]) {
  setOverlay((prev) => ({
    ...prev,
    fontColor: preset.fontColor,
    boxColor: preset.boxColor,
    boxOpacity: preset.boxOpacity,
    boxEnabled: preset.boxOpacity > 0,
  }));

  setPreviewColorPreset(null);
  setShowColorGuide(false);
}

  async function downloadVideo(targetUrl?: string) {
    const url = safeText(targetUrl) || safeText(videoUrl);

    if (!url) {
      setReason("保存できるCM動画がありません");
      return;
    }

    setReason("");
    setDownloadBusy(true);

    try {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`動画ファイルの取得に失敗しました（${res.status}）`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = buildDownloadFileName(brandId, draftId);
      a.rel = "noopener";

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(blobUrl);

      showMsg?.("✅ CM動画の保存を開始しました");
    } catch (e: any) {
      setReason(e?.message || "動画の保存に失敗しました");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function persistCmVideo(partial?: Partial<CmVideo>) {
    const nextPersona =
      partial?.persona !== undefined
        ? partial.persona
          ? buildPersona(partial.persona)
          : null
        : persona
          ? buildPersona(persona)
          : null;

    const nextUrls = Array.isArray(partial?.urls)
      ? partial.urls.map((x) => safeText(x)).filter(Boolean).slice(0, 10)
      : urls;

    const next: CmVideo = {
      provider: "runway",
      taskId: safeText(partial?.taskId ?? taskId) || null,
      status: (partial?.status ?? status) as CmVideoStatus,
      url: safeText(partial?.url ?? originalCmUrl) || null,
      urls: nextUrls,
      persona: nextPersona,

      overlay: partial?.overlay ?? overlay,
      overlayUrl: safeText(partial?.overlayUrl ?? overlayUrl) || null,
      overlayPath: safeText(partial?.overlayPath) || safeText(initCmVideo.overlayPath) || null,
      overlayUrls: Array.isArray(partial?.overlayUrls)
        ? partial.overlayUrls.map((x) => safeText(x)).filter(Boolean).slice(0, 10)
        : Array.isArray(initCmVideo.overlayUrls)
          ? initCmVideo.overlayUrls.map((x) => safeText(x)).filter(Boolean).slice(0, 10)
          : [],
    };

    await saveDraft({ cmVideo: next });
    return next;
  }

  async function designWorldSpec() {
    setReason("");

    if (!uid) return setReason("ログインが必要です");
    if (!draftId) return setReason("下書きIDがありません（保存して作成してください）");

    const token = await getFreshToken(idToken);
    if (!token) return setReason("トークンがありません（再ログインしてください）");

    const p = safeText(philosophy);
    if (!p) return setReason("ブランド仕様書・ブランド思想が空です");

    setLocalBusy(true);

    try {
      const res = await fetch("/api/cm-worldspec", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId,
          brandId,
          philosophy: p,
          keywords: safeText(keywordsText),
          emotion: safeText(emotion),
          purpose: safeText(purpose),
          heroSubject: safeText(heroSubject),
          visualDirection: safeText(visualDirection),
          brandMessage: safeText(brandMessage),
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j?.ok === false) {
        throw new Error(String(j?.error || "worldSpec生成に失敗しました"));
      }

      const text = safeText(j?.worldSpecText) || safeText(j?.text) || safeText(j?.spec);
      if (!text) throw new Error("worldSpecが空です（API返却を確認してください）");

      setWorldSpecText(text);
      showMsg?.("✅ ブランドCM用の世界観を設計しました");
    } catch (e: any) {
      setReason(e?.message || "worldSpec生成でエラー");
    } finally {
      setLocalBusy(false);
    }
  }

  async function generateCm() {
    setReason("");

    if (!uid) return setReason("ログインが必要です");
    if (!draftId) return setReason("下書きIDがありません（保存して作成してください）");

    const token = await getFreshToken(idToken);
    if (!token) return setReason("トークンがありません（再ログインしてください）");

    const spec = safeText(worldSpecText);
    if (!spec) return setReason("先に「世界観を設計する」を押してください");

    const nextPersona = buildPersona(persona);

    setLocalBusy(true);

    try {
      stopPolling();

      const res = await fetch("/api/cm-generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId,
          brandId,
          worldSpecText: spec,
          seconds: nextPersona.seconds,
          quality: nextPersona.quality,
          size: nextPersona.size,
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok && res.status !== 202) {
        throw new Error(String(j?.error || "CM生成開始に失敗しました"));
      }

      const t = safeText(j?.taskId || j?.id);
      if (!t) {
        setStatus("queued");
        await persistCmVideo({ status: "queued", persona: nextPersona });
        showMsg?.("CM生成を開始しました（queued）");
        return;
      }

      setTaskId(t);
      setStatus("queued");
      setPersona(nextPersona);

      setOverlayUrl("");
      setVideoUrl("");
      setOriginalCmUrl("");

      await persistCmVideo({
        taskId: t,
        status: "queued",
        persona: nextPersona,
        overlayUrl: null,
        overlayUrls: [],
      });

      showMsg?.("✅ CM生成を開始しました（taskId保存）");
      startPolling(t);
    } catch (e: any) {
      setReason(e?.message || "CM生成開始でエラー");
    } finally {
      setLocalBusy(false);
    }
  }

  async function checkStatusOnce(currentTaskId: string) {
    const t = safeText(currentTaskId);
    if (!t) return setReason("taskIdがありません（先にCM生成）");
    if (!draftId) return setReason("下書きIDがありません");

    const token = await getFreshToken(idToken);
    if (!token) return setReason("トークンがありません（再ログインしてください）");

    const res = await fetch("/api/cm-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draftId, taskId: t }),
    });

    const j = await res.json().catch(() => ({} as any));

    if (!res.ok || j?.ok === false) {
      setReason(String(j?.error || "status確認に失敗しました"));
      if (String(j?.error || "").includes("expired")) stopPolling();
      return;
    }

    const st = safeText(j?.status || j?.state || "");
    const url = safeText(j?.videoUrl || j?.url || j?.outputUrl || "");

    const nextStatus: CmVideoStatus =
      st === "succeeded" || st === "completed"
        ? "done"
        : st === "failed"
          ? "error"
          : st === "queued"
            ? "queued"
            : "running";

    setStatus(nextStatus);

    if (nextStatus === "done" && url) {
      stopPolling();

      const nextUrls = uniqPushFront(urls, url);

      setOriginalCmUrl(url);
      setVideoUrl(url);
      setUrls(nextUrls);

      await persistCmVideo({
        taskId: t,
        status: "done",
        url,
        urls: nextUrls,
        persona: persona ?? buildPersona(null),
      });

      showMsg?.("✅ ブランドCMが完成しました");
      return;
    }

    if (nextStatus === "error") {
      stopPolling();
      await persistCmVideo({
        taskId: t,
        status: "error",
        persona: persona ?? buildPersona(null),
      });
      setReason("CM生成が失敗しました（サーバログ/Runway側を確認）");
      return;
    }

    await persistCmVideo({
      taskId: t,
      status: nextStatus,
      persona: persona ?? buildPersona(null),
    });
  }

  async function burnOverlay() {
    const sourceUrl = safeText(originalCmUrl) || safeText(videoUrl);

    if (!uid) return setReason("ログインが必要です");
    if (!draftId) return setReason("下書きIDがありません");
    if (!sourceUrl) return setReason("焼き込み元のCM動画がありません");

    if (!safeText(overlay.text) && !overlay.logoEnabled) {
      return setReason("焼き込む文字、またはロゴを設定してください");
    }

    const token = await getFreshToken(idToken);
    if (!token) return setReason("トークンがありません（再ログインしてください）");

    setReason("");
    setBurnBusy(true);

    try {
      const res = await fetch("/api/cm-burn-overlay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
body: JSON.stringify({
  draftId,
  videoUrl: sourceUrl,
  overlay,
  size: persona?.size ?? "720x1280",
  seconds: persona?.seconds ?? 5,
}),
      });

      const j = await res.json().catch(() => ({} as any));

      if (!res.ok || j?.ok === false) {
        throw new Error(String(j?.error || "文字・ロゴ焼き込みに失敗しました"));
      }

      const burnedUrl = safeText(j?.overlayUrl || j?.videoUrl || j?.url);

      if (!burnedUrl) {
        throw new Error("焼き込み後の動画URLが返っていません");
      }

      const currentOverlayUrls = Array.isArray((j?.cmVideo as any)?.overlayUrls)
        ? (j.cmVideo as any).overlayUrls.map((x: any) => safeText(x)).filter(Boolean)
        : [burnedUrl];

setOverlayUrl(burnedUrl);
setSelectedOverlayHistoryUrl(burnedUrl);
setOverlayUrls(currentOverlayUrls);
setVideoUrl(burnedUrl);

      await persistCmVideo({
        overlay,
        overlayUrl: burnedUrl,
        overlayPath: safeText(j?.path) || null,
        overlayUrls: currentOverlayUrls,
      });

      showMsg?.("✅ 文字・ロゴ入りCMを保存しました");
    } catch (e: any) {
      setReason(e?.message || "文字・ロゴ焼き込みに失敗しました");
    } finally {
      setBurnBusy(false);
    }
  }

async function hideHistoryUrl(kind: "original" | "overlay", url: string) {
  const target = safeText(url);
  if (!target) return;

  if (kind === "original") {
setHiddenOriginalUrls((prev: string[]) => uniqPushFront(prev, target));
    if (originalCmUrl === target) {
      const next = urls.find((x) => safeText(x) && safeText(x) !== target);
      setOriginalCmUrl(next || "");
      setSelectedOriginalHistoryUrl(next || "");
      setVideoUrl(next || overlayUrl || "");
    }
    return;
  }

setHiddenOverlayUrls((prev: string[]) => uniqPushFront(prev, target));
  if (overlayUrl === target) {
const next = overlayUrls.find((x: string) => safeText(x) && safeText(x) !== target);
    setOverlayUrl(next || "");
    setSelectedOverlayHistoryUrl(next || "");
    setVideoUrl(next || originalCmUrl || "");
  }
}

async function deleteHistoryUrlFromFirestore(kind: "original" | "overlay", url: string) {
  const target = safeText(url);

  if (!target) return;
  if (!isAdmin) {
    setReason("Firestoreからの完全削除は管理者のみ可能です");
    return;
  }

  const nextOriginalUrls = urls.filter((x) => safeText(x) && safeText(x) !== target);
const nextOverlayUrls = overlayUrls.filter((x: string) => safeText(x) && safeText(x) !== target);

  if (kind === "original") {
    setUrls(nextOriginalUrls);

    if (originalCmUrl === target) {
      const next = nextOriginalUrls[0] || "";
      setOriginalCmUrl(next);
      setSelectedOriginalHistoryUrl(next);
      setVideoUrl(next || overlayUrl || "");
    }

    await persistCmVideo({
      urls: nextOriginalUrls,
      url: originalCmUrl === target ? nextOriginalUrls[0] || null : originalCmUrl,
    });

    showMsg?.("✅ 元動画履歴をFirestoreから削除しました");
    return;
  }

  setOverlayUrls(nextOverlayUrls);

  if (overlayUrl === target) {
    const next = nextOverlayUrls[0] || "";
    setOverlayUrl(next);
    setSelectedOverlayHistoryUrl(next);
    setVideoUrl(next || originalCmUrl || "");
  }

  await persistCmVideo({
    overlayUrls: nextOverlayUrls,
    overlayUrl: overlayUrl === target ? nextOverlayUrls[0] || null : overlayUrl,
  });

  showMsg?.("✅ 焼き込み後履歴をFirestoreから削除しました");
}


  function startPolling(currentTaskId: string) {
    stopPolling();
    setStatus("running");

    pollingRef.current = setInterval(() => {
      void checkStatusOnce(currentTaskId);
    }, 7000);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
{showColorGuide ? (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4">
    <div className="grid max-h-[88vh] w-full max-w-5xl grid-cols-1 gap-4 overflow-hidden rounded-2xl border border-white/15 bg-[#0F1E30] p-4 shadow-2xl md:grid-cols-[1fr_320px]">
      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-white">配色を目で選ぶ</div>
            <div className="mt-1 text-xs text-white/60">
              カードにマウスを乗せると右側で大きく確認できます。クリックで反映します。
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setPreviewColorPreset(null);
              setShowColorGuide(false);
            }}
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-1 text-xs font-black text-white"
          >
            閉じる
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onMouseEnter={() => setPreviewColorPreset(preset)}
              onFocus={() => setPreviewColorPreset(preset)}
              onClick={() => applyColorPreset(preset)}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
            >
              <div
                className="flex h-24 items-center justify-center px-4"
                style={{
                  background:
                    preset.boxOpacity > 0
                      ? `linear-gradient(135deg, ${preset.boxColor}, rgba(255,255,255,0.08))`
                      : "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
                }}
              >
                <div
                  className="rounded-lg px-4 py-2 text-center text-base font-black shadow-lg"
                  style={{
                    color: preset.fontColor,
                    backgroundColor:
                      preset.boxOpacity > 0
                        ? `${preset.boxColor}${Math.round(preset.boxOpacity * 255)
                            .toString(16)
                            .padStart(2, "0")}`
                        : "transparent",
                  }}
                >
                  時間を素材に、新しいかたちへ。
                </div>
              </div>

              <div className="p-3">
                <div className="text-xs font-black text-white">{preset.name}</div>
                <div className="mt-1 text-[11px] text-white/55" style={{ lineHeight: 1.6 }}>
                  {preset.memo}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="text-xs font-black text-white/80">大きく確認</div>

        <div
          className="mt-3 flex h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-cover bg-center p-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(20,30,40,0.95), rgba(120,95,60,0.55), rgba(10,15,25,0.95))",
          }}
        >
          <div
            className="w-full rounded-2xl px-5 py-4 text-center shadow-2xl"
            style={{
              backgroundColor:
                (previewColorPreset ?? COLOR_PRESETS[0]).boxOpacity > 0
                  ? `${(previewColorPreset ?? COLOR_PRESETS[0]).boxColor}${Math.round(
                      (previewColorPreset ?? COLOR_PRESETS[0]).boxOpacity * 255
                    )
                      .toString(16)
                      .padStart(2, "0")}`
                  : "transparent",
            }}
          >
            <div
              className="text-xl font-black"
              style={{ color: (previewColorPreset ?? COLOR_PRESETS[0]).fontColor }}
            >
              時間を素材に、新しいかたちへ。
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs font-black text-white">
          {(previewColorPreset ?? COLOR_PRESETS[0]).name}
        </div>
        <div className="mt-1 text-[11px] text-white/55" style={{ lineHeight: 1.6 }}>
          {(previewColorPreset ?? COLOR_PRESETS[0]).memo}
        </div>
      </div>
    </div>
  </div>
) : null}
      <div className="text-white/90 font-black text-sm">🟣 ブランドCM（完全生成型）</div>

      <div className="text-white/60 text-xs mt-1" style={{ lineHeight: 1.6 }}>
        ・日本語のブランド思想からCM動画を作ります<br />
        ・英語のworldSpecはRunway用の内部指示です。通常は触らなくて大丈夫です<br />
        ・完成後に文字/ロゴをフェード付きで焼き込めます
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div>
          <FieldLabel>ブランド仕様書・思想（必須）</FieldLabel>
          <textarea
            value={philosophy}
            onChange={(e) => setPhilosophy(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            style={{ minHeight: 180 }}
            placeholder="Ventoの仕様書、ブランド思想、世界観などをそのまま貼り付けできます。"
            disabled={isBusy}
          />
        </div>

        <div>
          <FieldLabel>CMで映したい主役（推奨）</FieldLabel>
          <input
            value={heroSubject}
            onChange={(e) => setHeroSubject(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="例：古い木机、真鍮の小物、アンティークカー、革の質感"
            disabled={isBusy}
          />
          <HelpText>動画の中心に映したいもの。ここが曖昧だと“雰囲気だけ動画”になりやすいです。</HelpText>
        </div>

        <div>
          <FieldLabel>映像の方向性（推奨）</FieldLabel>
          <input
            value={visualDirection}
            onChange={(e) => setVisualDirection(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="例：窓際の自然光、木・金属・革の質感、静かな室内、ゆっくり寄る"
            disabled={isBusy}
          />
        </div>

        <div>
          <FieldLabel>伝えたい一文（動画内には出さない）</FieldLabel>
          <input
            value={brandMessage}
            onChange={(e) => setBrandMessage(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="例：時間を素材に、新しいかたちへ。"
            disabled={isBusy}
          />
        </div>

        <div>
          <FieldLabel>キーワード（任意）</FieldLabel>
          <input
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="例：静けさ, 余白, 木, 金属, 革, 再構成"
            disabled={isBusy}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="感情：静謐 / 郷愁 / 信頼"
            disabled={isBusy}
          />
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="目的：ブランド認知 / 世界観提示"
            disabled={isBusy}
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3">
        <FieldLabel>CM設定</FieldLabel>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={persona?.seconds ?? 5}
            disabled={isBusy}
            onChange={(e) =>
              setPersona(
                buildPersona({
                  ...(persona ?? buildPersona(null)),
                  seconds: normalizeSeconds(e.target.value),
                })
              )
            }
            className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
          >
            <option value={5}>5秒</option>
            <option value={10}>10秒</option>
          </select>

          <select
            value={persona?.quality ?? "standard"}
            disabled={isBusy}
            onChange={(e) =>
              setPersona(
                buildPersona({
                  ...(persona ?? buildPersona(null)),
                  quality: normalizeQuality(e.target.value),
                })
              )
            }
            className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
          >
            <option value="standard">standard</option>
            <option value="high">high</option>
          </select>

          <select
            value={persona?.size ?? "720x1280"}
            disabled={isBusy}
            onChange={(e) =>
              setPersona(
                buildPersona({
                  ...(persona ?? buildPersona(null)),
                  size: normalizeSize(e.target.value),
                })
              )
            }
            className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
          >
            <option value="720x1280">縦 720x1280</option>
            <option value="960x960">正方形 960x960</option>
            <option value="1280x720">横 1280x720</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/15 bg-white/10 text-white font-black text-sm disabled:opacity-50"
          disabled={isBusy}
          onClick={() => void designWorldSpec()}
        >
          世界観を設計する
        </button>

        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/15 bg-white/20 text-white font-black text-sm disabled:opacity-50"
          disabled={isBusy}
          onClick={() => void generateCm()}
        >
          CMを生成する
        </button>

        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/15 bg-black/10 text-white/80 font-black text-sm disabled:opacity-50"
          disabled={isBusy}
          onClick={() =>
            taskId ? void checkStatusOnce(taskId) : setReason("taskIdがありません（先にCM生成）")
          }
        >
          状態を確認
        </button>

        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/10 bg-black/10 text-white/60 font-black text-sm disabled:opacity-50"
          disabled={isBusy}
          onClick={() => {
            stopPolling();
            setReason("ポーリング停止");
          }}
        >
          自動確認を止める
        </button>
      </div>

      <details className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3">
        <summary className="cursor-pointer text-xs font-black text-white/80">
          詳細設定：Runway用プロンプトを開く
        </summary>

        <div className="mt-2 text-[11px] text-white/50" style={{ lineHeight: 1.6 }}>
          ここはAIがRunwayへ送る英語指示です。基本は編集不要です。
          動画が抽象的すぎる、物体が崩れる、文字が出る場合だけ調整します。
        </div>

        <textarea
          value={worldSpecText}
          onChange={(e) => setWorldSpecText(e.target.value)}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white/90 outline-none"
          style={{ minHeight: 160 }}
          placeholder="ここにCM設計仕様が入ります"
          disabled={isBusy}
        />
      </details>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="text-white/80 text-xs">
          状態：<span className="text-white font-black">{status}</span>
          {taskId ? <span className="text-white/50 ml-2">taskId={taskId}</span> : null}
        </div>
        {reason ? <div className="text-red-300 text-xs mt-2">{reason}</div> : null}
      </div>

      <div className="mt-4">
        <FieldLabel>CMプレビュー</FieldLabel>

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
  <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
    <div className="mb-2 text-xs font-black text-white/80">元動画の履歴</div>

    {urls.length ? (
      <select
        value={selectedOriginalHistoryUrl || originalCmUrl || ""}
        onChange={(e) => {
          const url = e.target.value;
          setSelectedOriginalHistoryUrl(url);
          setOriginalCmUrl(url);
          setVideoUrl(url);
        }}
        className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
        disabled={isBusy}
      >
        {urls.map((url, index) => (
          <option key={`${url}-${index}`} value={url}>
            元動画 {index + 1}
          </option>
        ))}
      </select>
    ) : (
      <div className="text-xs text-white/45">元動画の履歴はまだありません</div>
    )}
  </div>

  <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
    <div className="mb-2 text-xs font-black text-white/80">焼き込み後動画の履歴</div>

    {Array.isArray(initCmVideo.overlayUrls) && initCmVideo.overlayUrls.length ? (
      <select
        value={selectedOverlayHistoryUrl || overlayUrl || ""}
        onChange={(e) => {
          const url = e.target.value;
          setSelectedOverlayHistoryUrl(url);
          setOverlayUrl(url);
          setVideoUrl(url);
        }}
        className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
        disabled={isBusy}
      >
        {initCmVideo.overlayUrls
          .map((url) => safeText(url))
          .filter(Boolean)
          .map((url, index) => (
            <option key={`${url}-${index}`} value={url}>
              焼き込み後 {index + 1}
            </option>
          ))}
      </select>
    ) : overlayUrl ? (
      <select
        value={selectedOverlayHistoryUrl || overlayUrl}
        onChange={(e) => {
          const url = e.target.value;
          setSelectedOverlayHistoryUrl(url);
          setOverlayUrl(url);
          setVideoUrl(url);
        }}
        className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
        disabled={isBusy}
      >
        <option value={overlayUrl}>焼き込み後 1</option>
      </select>
    ) : (
      <div className="text-xs text-white/45">焼き込み後動画の履歴はまだありません</div>
    )}
  </div>
</div>

        {originalCmUrl || overlayUrl || videoUrl ? (
       <div className="flex flex-col gap-4">
       <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="mb-2 text-xs font-black text-white/80">焼き込み前の元動画</div>
              {originalCmUrl ? (
                <video
                  src={originalCmUrl}
                  controls
                  className="w-full rounded-xl border border-white/10"
                  style={{
                 width: "100%",
                 maxHeight: 360,
                 objectFit: "contain",
                 background: "rgba(0,0,0,0.25)",
               }}
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/30 p-6 text-center text-xs text-white/50">
                  元動画がまだありません
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="mb-2 text-xs font-black text-white/80">焼き込み後の動画</div>
              {overlayUrl ? (
                <video
                  src={overlayUrl}
                  controls
                  className="w-full rounded-xl border border-white/10"
                  style={{
                   width: "100%",
                   maxHeight: 360,
                   objectFit: "contain",
                   background: "rgba(0,0,0,0.25)",
                         }}
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/30 p-6 text-center text-xs text-white/50">
                  まだ文字・ロゴ焼き込み後の動画はありません
                </div>
              )}
            </div>
          </div>

          <div className="max-h-[680px] overflow-y-auto rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="text-white/80 text-xs font-black">文字・ロゴ焼き込み設定</div>
              <HelpText>
                下の設定を変更して「文字・ロゴを焼き込む」を押すと、元動画とは別に“焼き込み後動画”が保存されます。
              </HelpText>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <div>
                  <FieldLabel>表示する文字</FieldLabel>
                  <textarea
                    value={overlay.text}
                    onChange={(e) => setOverlay((p) => ({ ...p, text: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
                    style={{ minHeight: 76 }}
                    placeholder="例：時間を素材に、新しいかたちへ。"
                    disabled={isBusy}
                  />
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
  <div className="mb-2 text-xs font-black text-white/80">文字の見え方プレビュー</div>

  <div
    className="flex min-h-[120px] items-center justify-center rounded-xl border border-white/10 p-4"
    style={{
      background:
        "linear-gradient(135deg, rgba(35,45,55,0.95), rgba(120,90,55,0.55), rgba(10,15,25,0.95))",
    }}
  >
    <div
      className="rounded-xl px-5 py-3 text-center font-black"
      style={{
        color: overlay.fontColor || "#FFFFFF",
        fontSize: Math.max(14, Math.min(42, Number(overlay.fontSize) || 24)),
        lineHeight: overlay.lineHeight || 1.25,
        backgroundColor: overlay.boxEnabled
          ? `${overlay.boxColor || "#000000"}${Math.round(
              Math.max(0, Math.min(1, Number(overlay.boxOpacity) || 0)) * 255
            )
              .toString(16)
              .padStart(2, "0")}`
          : "transparent",
      }}
    >
      {safeText(overlay.text) || "時間を素材に、新しいかたちへ。"}
    </div>
  </div>

  <HelpText>
    ここは保存前の確認用です。色・透明度・文字サイズを変えるとすぐ反映されます。
  </HelpText>
</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <FieldLabel>表示開始</FieldLabel>
                    <input
                      type="number"
                      step="0.1"
                      value={overlay.startSec}
                      onChange={(e) => setOverlay((p) => ({ ...p, startSec: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    />
                    <HelpText>何秒から出すか</HelpText>
                  </div>

                  <div>
                    <FieldLabel>表示終了</FieldLabel>
                    <input
                      type="number"
                      step="0.1"
                      value={overlay.endSec}
                      onChange={(e) => setOverlay((p) => ({ ...p, endSec: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    />
                    <HelpText>何秒で消すか</HelpText>
                  </div>

                  <div>
                    <FieldLabel>フェードイン</FieldLabel>
                    <input
                      type="number"
                      step="0.1"
                      value={overlay.fadeInSec}
                      onChange={(e) => setOverlay((p) => ({ ...p, fadeInSec: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    />
                    <HelpText>出現のなめらかさ</HelpText>
                  </div>

                  <div>
                    <FieldLabel>フェードアウト</FieldLabel>
                    <input
                      type="number"
                      step="0.1"
                      value={overlay.fadeOutSec}
                      onChange={(e) => setOverlay((p) => ({ ...p, fadeOutSec: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    />
                    <HelpText>消え方のなめらかさ</HelpText>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <FieldLabel>文字位置</FieldLabel>
                    <select
                      value={overlay.position}
                      onChange={(e) =>
                        setOverlay((p) => ({
                          ...p,
                          position: normalizePosition(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    >
                      <option value="top">上</option>
                      <option value="center">中央</option>
                      <option value="bottom">下</option>
                      <option value="leftBottom">左下</option>
                      <option value="rightBottom">右下</option>
                    </select>
                  </div>

                  <div>
                    <FieldLabel>文字サイズ</FieldLabel>
                    <input
                      type="number"
                      value={overlay.fontSize}
                      onChange={(e) => setOverlay((p) => ({ ...p, fontSize: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    />
                  </div>

<LiveColorPicker
  label="文字色"
  color={overlay.fontColor || "#FFFFFF"}
  onColorChange={(color) => setOverlay((p) => ({ ...p, fontColor: color }))}
/>

                  <div>
                    <FieldLabel>太さ</FieldLabel>
                    <select
                      value={overlay.fontWeight}
                      onChange={(e) =>
                        setOverlay((p) => ({
                          ...p,
                          fontWeight: e.target.value === "bold" ? "bold" : "normal",
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    >
                      <option value="normal">通常</option>
                      <option value="bold">太字</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2 text-white/70 text-xs">
                    <input
                      type="checkbox"
                      checked={overlay.boxEnabled}
                      onChange={(e) => setOverlay((p) => ({ ...p, boxEnabled: e.target.checked }))}
                      disabled={isBusy}
                    />
                    文字の背景帯
                  </label>

<div className="md:col-span-2">
  <LiveColorPicker
    label="文字背景色・透明度"
    color={overlay.boxColor || "#000000"}
    opacity={overlay.boxOpacity}
    showOpacity
    onColorChange={(color) => setOverlay((p) => ({ ...p, boxColor: color }))}
    onOpacityChange={(opacity) =>
      setOverlay((p) => ({
        ...p,
        boxOpacity: opacity,
        boxEnabled: opacity > 0,
      }))
    }
  />
</div>

                  <div>
                    <FieldLabel>行間</FieldLabel>
                    <input
                      type="number"
                      step="0.05"
                      value={overlay.lineHeight}
                      onChange={(e) => setOverlay((p) => ({ ...p, lineHeight: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <label className="flex items-center gap-2 text-white/75 text-xs font-black">
                    <input
                      type="checkbox"
                      checked={overlay.logoEnabled}
                      onChange={(e) => setOverlay((p) => ({ ...p, logoEnabled: e.target.checked }))}
                      disabled={isBusy}
                    />
                    ロゴを表示する
                  </label>

                  <div className="mt-3">
                    <FieldLabel>ロゴ画像URL</FieldLabel>
                    <input
                      value={overlay.logoUrl}
                      onChange={(e) => setOverlay((p) => ({ ...p, logoUrl: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
                      placeholder="https://..."
                      disabled={isBusy}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <FieldLabel>ロゴ位置</FieldLabel>
                      <select
                        value={overlay.logoPosition}
                        onChange={(e) =>
                          setOverlay((p) => ({
                            ...p,
                            logoPosition: normalizePosition(e.target.value),
                          }))
                        }
                        className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                        disabled={isBusy}
                      >
                        <option value="top">上</option>
                        <option value="center">中央</option>
                        <option value="bottom">下</option>
                        <option value="leftBottom">左下</option>
                        <option value="rightBottom">右下</option>
                      </select>
                    </div>

                    <div>
                      <FieldLabel>ロゴ幅</FieldLabel>
                      <input
                        type="number"
                        value={overlay.logoWidth}
                        onChange={(e) => setOverlay((p) => ({ ...p, logoWidth: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                        disabled={isBusy}
                      />
                    </div>

                    <div>
                      <FieldLabel>ロゴ透明度</FieldLabel>
                      <input
                        type="number"
                        step="0.05"
                        value={overlay.logoOpacity}
                        onChange={(e) => setOverlay((p) => ({ ...p, logoOpacity: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-black/30 p-2 text-white outline-none"
                        disabled={isBusy}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void burnOverlay()}
                    disabled={isBusy}
                    className="rounded-xl px-4 py-2 border border-white/15 bg-white/20 text-white font-black text-sm disabled:opacity-50"
                  >
                    {burnBusy ? "焼き込み中..." : "文字・ロゴを焼き込む"}
                  </button>

                  {overlayUrl ? (
                    <button
                      type="button"
                      onClick={() => setVideoUrl(overlayUrl)}
                      disabled={isBusy}
                      className="rounded-xl px-4 py-2 border border-white/10 bg-black/10 text-white/70 font-black text-sm disabled:opacity-50"
                    >
                      焼き込み後を選択
                    </button>
                  ) : null}

                  {originalCmUrl ? (
                    <button
                      type="button"
                      onClick={() => setVideoUrl(originalCmUrl)}
                      disabled={isBusy}
                      className="rounded-xl px-4 py-2 border border-white/10 bg-black/10 text-white/70 font-black text-sm disabled:opacity-50"
                    >
                      元動画を選択
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void downloadVideo(videoUrl)}
              disabled={downloadBusy}
              className="rounded-xl px-4 py-2 border border-white/15 bg-white/10 text-white font-black text-sm disabled:opacity-50"
            >
              {downloadBusy ? "保存準備中..." : "選択中の動画を保存"}
            </button>

            <div className="text-white/45 text-[11px]" style={{ lineHeight: 1.6 }}>
              ※スマホでは保存先の選択画面や共有メニューが開く場合があります。
            </div>
          </div>
        ) : (
          <div
            className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
            style={{ height: 160, fontSize: 13 }}
          >
            まだCM動画がありません（生成後に表示）
          </div>
        )}
      </div>
    </div>
  );
}