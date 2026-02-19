// /components/cm/BrandCMPanel.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CmVideo, CmVideoPersona, CmVideoStatus, UiVideoSize } from "@/lib/types/draft";

export type BrandCMPanelProps = {
  uid: string | null;
  draftId: string | null;

  // auth token を page.tsx で持ってる前提（既存構造に合わせる）
  idToken: string | null;

  // brand（vento/riva）など
  brandId: string;

  // Firestore保存関数（page.tsx の saveDraft を注入して使う）
  // ✅ ここは「cmVideo を保存する」ために使う。page.tsx側はcmVideoを触らない。
  saveDraft: (partial?: any) => Promise<any>;

  // 既存draftから初期値を入れたい場合（旧cmAppliedでもOK）
  initial?: {
    philosophy?: string;
    keywordsText?: string;
    emotion?: string;
    purpose?: string;
    worldSpecText?: string;

    // ✅ 新cmVideo
    cmVideo?: Partial<CmVideo>;

    // ⚠️ 旧互換（cmApplied）
    runwayTaskId?: string;
    runwayStatus?: any;
    runwayVideoUrl?: string;
  };

  // 表示用
  busy?: boolean;

  // UIメッセージを page.tsx に合わせたい場合
  showMsg?: (s: string) => void;
};

function safeText(v: any) {
  return String(v ?? "").trim();
}

function normalizeStatus(v: any): CmVideoStatus {
  const s = safeText(v);
  if (s === "idle") return "idle";
  if (s === "queued") return "queued";
  if (s === "running") return "running";
  if (s === "done") return "done";
  if (s === "error") return "error";

  // 旧Runway表現の吸収
  if (s === "succeeded" || s === "completed") return "done";
  if (s === "failed") return "error";
  if (s === "designed") return "idle"; // worldSpec設計はcmVideo状態ではない
  if (!s) return "idle";
  return "running";
}

function uniqPushFront(arr: string[], url: string) {
  const u = safeText(url);
  if (!u) return arr;
  const next = [u, ...arr.filter((x) => safeText(x) && safeText(x) !== u)];
  return next;
}

export default function BrandCMPanel(props: BrandCMPanelProps) {
  const { uid, draftId, idToken, brandId, saveDraft, initial, busy, showMsg } = props;

  // ---------- inputs ----------
  const [philosophy, setPhilosophy] = useState<string>(safeText(initial?.philosophy));
  const [keywordsText, setKeywordsText] = useState<string>(safeText(initial?.keywordsText));
  const [emotion, setEmotion] = useState<string>(safeText(initial?.emotion));
  const [purpose, setPurpose] = useState<string>(safeText(initial?.purpose));

  const [worldSpecText, setWorldSpecText] = useState<string>(safeText(initial?.worldSpecText));
  const [reason, setReason] = useState<string>("");

  // ---------- cmVideo state ----------
  const initCmVideo: Partial<CmVideo> = {
    ...(initial?.cmVideo || {}),
  };

  // 旧cmApplied互換（もし initial しか来ない場合）
  const legacyTaskId = safeText(initial?.runwayTaskId);
  const legacyUrl = safeText(initial?.runwayVideoUrl);
  const legacyStatus = normalizeStatus(initial?.runwayStatus);

  const [taskId, setTaskId] = useState<string>(safeText(initCmVideo.taskId) || legacyTaskId);
  const [status, setStatus] = useState<CmVideoStatus>(
    normalizeStatus(initCmVideo.status) !== "idle" ? normalizeStatus(initCmVideo.status) : legacyStatus
  );
  const [videoUrl, setVideoUrl] = useState<string>(safeText(initCmVideo.url) || legacyUrl);

  const [urls, setUrls] = useState<string[]>(Array.isArray(initCmVideo.urls) ? (initCmVideo.urls as string[]) : []);
  const [persona, setPersona] = useState<CmVideoPersona | null>(
    (initCmVideo.persona as any) || null
  );

  const pollingRef = useRef<any>(null);

  function stopPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // ✅ Firestoreへ「cmVideo」を保存（唯一ルート）
  async function persistCmVideo(partial?: Partial<CmVideo>) {
    const next: CmVideo = {
      provider: "runway",
      taskId: safeText(partial?.taskId ?? taskId) || null,
      status: (partial?.status ?? status) as CmVideoStatus,
      url: safeText(partial?.url ?? videoUrl) || null,
      urls: Array.isArray(partial?.urls) ? (partial?.urls as string[]) : urls,
      persona: (partial?.persona ?? persona) ? ((partial?.persona ?? persona) as CmVideoPersona) : null,
    };

    await saveDraft({ cmVideo: next });
    return next;
  }

  // ✅ ① OpenAI: worldSpec生成（完全生成型）
  async function designWorldSpec() {
    setReason("");
    if (!uid) return setReason("ログインが必要です");
    if (!draftId) return setReason("下書きIDがありません（保存して作成してください）");
    if (!idToken) return setReason("トークンがありません（再ログインしてください）");

    const p = safeText(philosophy);
    if (!p) return setReason("ブランド思想が空です");

    try {
      const res = await fetch("/api/cm-worldspec", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          draftId,
          brandId,
          philosophy: p,
          keywords: safeText(keywordsText),
          emotion: safeText(emotion),
          purpose: safeText(purpose),
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(String(j?.error || "worldSpec生成に失敗しました"));

      const text =
        (typeof j?.worldSpecText === "string" && j.worldSpecText) ||
        (typeof j?.text === "string" && j.text) ||
        (typeof j?.spec === "string" && j.spec) ||
        "";

      if (!text) throw new Error("worldSpecが空です（API返却を確認してください）");

      setWorldSpecText(text);
      showMsg?.("✅ 世界観（worldSpec）を設計しました");
    } catch (e: any) {
      setReason(e?.message || "worldSpec生成でエラー");
    }
  }

  // ✅ ② Runway: CM生成開始（完全生成型）
  async function generateCm() {
    setReason("");
    if (!uid) return setReason("ログインが必要です");
    if (!draftId) return setReason("下書きIDがありません（保存して作成してください）");
    if (!idToken) return setReason("トークンがありません（再ログインしてください）");

    const spec = safeText(worldSpecText);
    if (!spec) return setReason("先に「世界観を設計する」を押してください（worldSpecが必要）");

    try {
      stopPolling();

      const res = await fetch("/api/cm-generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          draftId,
          brandId,
          worldSpecText: spec,
        }),
      });

      const j = await res.json().catch(() => ({} as any));

      // 202でも開始扱い
      if (!res.ok && res.status !== 202) {
        throw new Error(String(j?.error || "CM生成開始に失敗しました"));
      }

      const t = safeText(j?.taskId || j?.id);
      if (!t) {
        // 202でtaskIdが返らない場合もあるなら queued 扱いだけ保存
        setStatus("queued");
        await persistCmVideo({ status: "queued" });
        showMsg?.("CM生成を開始しました（queued）");
        return;
      }

      setTaskId(t);
      setStatus("queued");

      await persistCmVideo({
        taskId: t,
        status: "queued",
      });

      showMsg?.("✅ CM生成を開始しました（taskId保存）");

      startPolling(t);
    } catch (e: any) {
      setReason(e?.message || "CM生成開始でエラー");
    }
  }

  // ✅ ③ ポーリング（CM専用）
  async function checkStatusOnce(currentTaskId: string) {
    const t = safeText(currentTaskId);
    if (!t) return;

    const res = await fetch("/api/cm-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ draftId, taskId: t }),
    });

    const j = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      setReason(String(j?.error || "status確認に失敗しました"));
      return;
    }

    const st = safeText(j?.status || j?.state || "");
    const url = safeText(j?.videoUrl || j?.url || j?.outputUrl || "");

    const nextStatus: CmVideoStatus =
      st === "succeeded" || st === "completed"
        ? "done"
        : st === "failed"
        ? "error"
        : st === "running"
        ? "running"
        : st === "queued"
        ? "queued"
        : "running";

    setStatus(nextStatus);

    // done + url
    if (nextStatus === "done" && url) {
      stopPolling();
      setVideoUrl(url);

      const nextUrls = uniqPushFront(urls, url);
      setUrls(nextUrls);

      await persistCmVideo({
        taskId: t,
        status: "done",
        url,
        urls: nextUrls,
      });

      showMsg?.("✅ ブランドCMが完成しました");
      return;
    }

    if (nextStatus === "error") {
      stopPolling();
      await persistCmVideo({ taskId: t, status: "error" });
      setReason("CM生成が失敗しました（サーバログ/Runway側を確認）");
      return;
    }

    await persistCmVideo({ taskId: t, status: nextStatus });
  }

  function startPolling(currentTaskId: string) {
    stopPolling();
    setStatus("running");

    pollingRef.current = setInterval(() => {
      void checkStatusOnce(currentTaskId);
    }, 3500);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-white/90 font-black text-sm">🟣 ブランドCM（完全生成型）</div>
      <div className="text-white/60 text-xs mt-1" style={{ lineHeight: 1.6 }}>
        ・商品動画と完全分離（cmVideoにのみ保存）<br />
        ・ボタン増やさない（固定演出なし）<br />
        ・世界観はOpenAI、生成はRunway
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div>
          <div className="text-white/80 text-xs font-black mb-1">ブランド思想（必須）</div>
          <textarea
            value={philosophy}
            onChange={(e) => setPhilosophy(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            style={{ minHeight: 120 }}
            placeholder="例：流行や価格ではなく、時間が残した佇まいを見る。"
            disabled={!!busy}
          />
        </div>

        <div>
          <div className="text-white/80 text-xs font-black mb-1">キーワード（任意）</div>
          <input
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
            placeholder="例：静けさ, 余白, 選別"
            disabled={!!busy}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-white/80 text-xs font-black mb-1">感情（任意）</div>
            <input
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
              placeholder="例：静謐 / 郷愁 / 高揚"
              disabled={!!busy}
            />
          </div>

          <div>
            <div className="text-white/80 text-xs font-black mb-1">目的（任意）</div>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none"
              placeholder="例：ブランドの信頼構築 / 印象固定"
              disabled={!!busy}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/15 bg-white/10 text-white font-black text-sm disabled:opacity-50"
          disabled={!!busy}
          onClick={() => void designWorldSpec()}
        >
          世界観を設計する
        </button>

        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/15 bg-white/20 text-white font-black text-sm disabled:opacity-50"
          disabled={!!busy}
          onClick={() => void generateCm()}
        >
          CMを生成する
        </button>

        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/15 bg-black/10 text-white/80 font-black text-sm disabled:opacity-50"
          disabled={!!busy}
          onClick={() => {
            if (!taskId) return setReason("taskIdがありません（先にCM生成）");
            void checkStatusOnce(taskId);
          }}
        >
          状態を確認
        </button>

        <button
          type="button"
          className="rounded-xl px-4 py-2 border border-white/10 bg-black/10 text-white/60 font-black text-sm disabled:opacity-50"
          disabled={!!busy}
          onClick={() => {
            stopPolling();
            setReason("ポーリング停止（課金0）");
          }}
        >
          自動確認を止める
        </button>
      </div>

      <div className="mt-4">
        <div className="text-white/80 text-xs font-black mb-1">worldSpec（自動生成）</div>
        <textarea
          value={worldSpecText}
          onChange={(e) => setWorldSpecText(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white/90 outline-none"
          style={{ minHeight: 140 }}
          placeholder="ここに世界観仕様が入ります（編集も可能）"
          disabled={!!busy}
        />
        <div className="text-white/50 text-[11px] mt-1" style={{ lineHeight: 1.6 }}>
          ※ ここは“固定テンプレ”ではなく、OpenAIが毎回設計する仕様です。
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="text-white/80 text-xs">
          状態：<span className="text-white font-black">{status}</span>
          {taskId ? <span className="text-white/50 ml-2">taskId={taskId}</span> : null}
        </div>
        {reason ? <div className="text-red-300 text-xs mt-2">{reason}</div> : null}
      </div>

      <div className="mt-4">
        <div className="text-white/80 text-xs font-black mb-2">CMプレビュー</div>
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            className="w-full rounded-xl border border-white/10"
            style={{ maxHeight: 360, background: "rgba(0,0,0,0.25)" }}
          />
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