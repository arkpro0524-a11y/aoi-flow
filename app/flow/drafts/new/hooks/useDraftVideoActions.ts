//app/flow/drafts/new/hooks/useDraftVideoActions.ts
"use client";

import { auth, storage } from "@/firebase";
import { ref, listAll, getDownloadURL, getMetadata } from "firebase/storage";
import type { DraftDoc, MotionCharacter } from "@/lib/types/draft";
import { splitKeywords } from "./useDraftEditorState";

/**
 * 動画関連専用hook
 *
 * ✅ 目的
 * - おすすめ動画プリセット取得
 * - 推奨適用
 * - 非AI動画保存
 * - 動画文字焼き込み
 * - 動画同期
 */

type Params = {
  uid: string | null;
  idToken: string;
  draftId: string | null;
  d: DraftDoc;
  dRef: React.MutableRefObject<DraftDoc>;
  currentSlot: "base" | "mood" | "composite";
  inFlightRef: React.MutableRefObject<Record<string, boolean>>;

  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setRightTab: React.Dispatch<React.SetStateAction<"image" | "video">>;
  setVideoTab: React.Dispatch<React.SetStateAction<"product" | "cm">>;
  setRecommendReason: React.Dispatch<React.SetStateAction<string>>;
  setVideoPickerValue: React.Dispatch<React.SetStateAction<any>>;
  setNonAiPreset: React.Dispatch<React.SetStateAction<any>>;
  setNonAiReason: React.Dispatch<React.SetStateAction<string>>;
  setSelectedVideoUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setNonAiVideoPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setNonAiVideoHistory: React.Dispatch<React.SetStateAction<string[]>>;
  setBurnReason: React.Dispatch<React.SetStateAction<string>>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;

  saveDraft: (partial?: Partial<DraftDoc>) => Promise<string | null>;
  showMsg: (s: string) => void;
};

export default function useDraftVideoActions(params: Params) {
  const {
    uid,
    idToken,
    draftId,
    d,
    dRef,
    currentSlot,
    inFlightRef,

    setBusy,
    setRightTab,
    setVideoTab,
    setRecommendReason,
    setVideoPickerValue,
    setNonAiPreset,
    setNonAiReason,
    setSelectedVideoUrl,
    setNonAiVideoPreviewUrl,
    setNonAiVideoHistory,
    setBurnReason,
    setD,

    saveDraft,
    showMsg,
  } = params;

  async function applyTopRecommendation(arg: any) {
    const recommended = Array.isArray(arg?.recommended) ? arg.recommended : [];
    const force = !!arg?.force;
    if (!recommended.length) return;

    const top = recommended[0];

    if (top?.engine === "nonai") {
      setVideoTab("product");
      setNonAiPreset(
        {
          id: String(top.id || ""),
          motionCharacter: top.motionCharacter,
        } as any
      );

      if (typeof top?.reason === "string" && top.reason.trim()) {
        setNonAiReason(top.reason.trim());
      } else if (force) {
        setNonAiReason("");
      }
      return;
    }

    if (top?.engine === "runway") {
      setVideoTab("cm");
      if (typeof top?.reason === "string" && top.reason.trim()) {
        showMsg(`推奨（ブランドCM）：${top.reason.trim()}`);
      } else if (force) {
        showMsg("推奨（ブランドCM）を適用しました");
      }
    }
  }

  async function fetchRecommendPresets() {
    const key = "recommendPresets";
    if (inFlightRef.current[key]) {
      setRecommendReason("おすすめ取得はすでに実行中です");
      return;
    }
    inFlightRef.current[key] = true;

    setRecommendReason("");

    try {
      const vision = (dRef.current.vision || "").trim();
      if (!vision) {
        setRecommendReason("おすすめは使えません：Vision（必須）が空です");
        return;
      }

      const body = {
        brand: {
          vision,
          voice: ((dRef.current as any).voice || "").trim(),
          ban: ((dRef.current as any).ban || "").trim(),
          must: ((dRef.current as any).must || "").trim(),
        },
        context: {
          purpose: ((dRef.current as any).purpose || "").trim(),
          platform: ((dRef.current as any).platform || "").trim(),
          keywords: splitKeywords(String((dRef.current as any).keywordsText ?? dRef.current.keywords ?? "")),
        },
      };

      const r = await fetch("/api/recommend-video", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          (typeof j?.error === "string" && j.error) ||
          (typeof j?.message === "string" && j.message) ||
          `recommend api error (status=${r.status})`;
        throw new Error(msg);
      }

      const raw = Array.isArray(j?.recommendedVideos) ? j.recommendedVideos : [];

      const normalized = raw
        .map((x: any) => {
          const recId = typeof x?.id === "string" ? x.id : "";
          if (!recId) return null;

          const engine: "nonai" | "runway" =
            String(x?.engine).toLowerCase() === "runway" ? "runway" : "nonai";

          const mc = x?.motionCharacter ?? null;

          const motionCharacter =
            mc &&
            typeof mc === "object" &&
            typeof mc.tempo === "string" &&
            typeof mc.reveal === "string" &&
            typeof mc.intensity === "string" &&
            typeof mc.attitude === "string" &&
            typeof mc.rhythm === "string"
              ? (mc as MotionCharacter)
              : null;

          if (!motionCharacter) return null;

          const reason = typeof x?.reason === "string" ? x.reason.trim() : "";

          return { id: recId, engine, motionCharacter, reason };
        })
        .filter(Boolean) as {
        id: string;
        engine: "nonai" | "runway";
        motionCharacter: MotionCharacter;
        reason: string;
      }[];

      if (!normalized.length) {
        setRecommendReason(
          "おすすめがありません（Vision/Keywords/ブランドを見直すか、手動で選んでください）"
        );
        setVideoPickerValue((prev: any) => ({ ...prev, recommended: [] }));
        return;
      }

      setVideoPickerValue((prev: any) => ({ ...prev, recommended: normalized as any }));
      await applyTopRecommendation({ force: false, recommended: normalized });
    } catch (e: any) {
      console.error(e);
      setRecommendReason(`おすすめ取得に失敗：${e?.message || "不明"}`);
    } finally {
      inFlightRef.current[key] = false;
    }
  }

  async function syncVideosFromStorage() {
    if (!uid) return;

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      showMsg("下書きIDの確定に失敗しました");
      return;
    }

    if (inFlightRef.current["syncVideos"]) return;
    inFlightRef.current["syncVideos"] = true;

    setBusy(true);

    try {
      const nonaiRef = ref(storage, `users/${uid}/drafts/${ensuredDraftId}/nonai`);
      const listedNonai = await listAll(nonaiRef).catch(() => ({ items: [] as any[] }));

      const found: { url: string; t: number; name: string }[] = [];

      for (const itemRef of listedNonai.items || []) {
        const name = String(itemRef.name || "").toLowerCase();
        if (!(name.endsWith(".mp4") || name.endsWith(".webm"))) continue;

        try {
          const meta = await getMetadata(itemRef);
          const t = meta?.timeCreated ? new Date(meta.timeCreated).getTime() : 0;
          const url = await getDownloadURL(itemRef);
          found.push({ url, t, name });
        } catch {
          //
        }
      }

      if (found.length === 0) {
        showMsg("この下書きの非AI動画が見つかりませんでした（保存先/拡張子を確認）");
        return;
      }

      found.sort((a, b) => (b.t || 0) - (a.t || 0));

      const mp4 = found.filter((x) => x.name.endsWith(".mp4")).map((x) => x.url);
      const webm = found.filter((x) => x.name.endsWith(".webm")).map((x) => x.url);
      const nonAi = [...mp4, ...webm].slice(0, 10);

      await saveDraft({
        nonAiVideoUrls: nonAi,
        nonAiVideoUrl: (nonAi[0] ?? dRef.current.nonAiVideoUrl ?? null) as any,
        videoSource: "nonai",
        phase: "draft",
      } as any);

      setD((prev) => ({
        ...prev,
        nonAiVideoUrls: nonAi,
        nonAiVideoUrl: (nonAi[0] ?? prev.nonAiVideoUrl ?? null) as any,
        videoSource: "nonai",
      }));

      showMsg(`非AI動画を同期しました：${nonAi.length}件`);
    } catch (e: any) {
      console.error(e);
      showMsg(`同期に失敗しました\n\n原因: ${e?.message || "不明"}`);
    } finally {
      setBusy(false);
      inFlightRef.current["syncVideos"] = false;
    }
  }

  async function saveNonAiVideoToDraft(args: {
    url: string;
    preset: DraftDoc["nonAiVideoPreset"];
  }) {
    const url = String(args.url || "").trim();
    if (!url) {
      setNonAiReason("保存できません：動画URLが空です");
      return;
    }

    if (!args.preset) {
      setNonAiReason("保存できません：動画の選択（人格）が未選択です");
      return;
    }

    setNonAiReason("");

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      setNonAiReason("保存できません：下書きIDの確定に失敗しました");
      return;
    }

    if (String(dRef.current.nonAiVideoUrl || "").trim() === url) {
      showMsg("同じ非AI動画はすでに代表に設定されています");
      return;
    }

    const currentList = Array.isArray(dRef.current.nonAiVideoUrls)
      ? dRef.current.nonAiVideoUrls
      : [];
    const nextNonAi = [
      url,
      ...currentList.filter((x) => String(x || "").trim() !== url),
    ].slice(0, 10);

    setRightTab("video");
    setSelectedVideoUrl(url);
    setNonAiVideoPreviewUrl(url);

    setNonAiPreset(args.preset ?? null);
    setNonAiVideoHistory(nextNonAi);

    setD((p) => ({
      ...p,
      videoSource: "nonai",
      nonAiVideoUrl: url,
      nonAiVideoPreset: args.preset ?? undefined,
      nonAiVideoUrls: nextNonAi,
    }));

    await saveDraft({
      videoSource: "nonai",
      nonAiVideoUrl: url,
      nonAiVideoPreset: args.preset ?? undefined,
      nonAiVideoUrls: nextNonAi,
      phase: "draft",
    } as any);

    showMsg("✅ 非AI動画を保存しました（代表動画に設定）");
  }

  async function burnVideo() {
    const src = String(d.nonAiVideoUrl || "").trim();
    if (!src) {
      setBurnReason("非AI動画がありません（先に非AI動画を生成/保存してください）");
      return;
    }

    const pickOverlay = () => {
      const slots = [currentSlot, "base", "composite"] as const;
      for (const s of slots) {
        const ov = dRef.current.textOverlayBySlot?.[s];
        const text = (ov?.lines ?? []).join("\n").trim();
        if (ov && text.length) return ov;
      }
      return null;
    };

    const overlay = pickOverlay();
    if (!overlay) {
      setBurnReason("文字がありません（①で文字をONにして入力してください）");
      return;
    }

    const ensuredDraftId = draftId ?? (await saveDraft());
    if (!ensuredDraftId) {
      setBurnReason("draftId がありません（先に保存してください）");
      return;
    }

    setBurnReason("");

    const res = await fetch("/api/burn-text-video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId: ensuredDraftId,
        videoUrl: src,
        overlay,
        size: d.videoSize ?? "720x1280",
      }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBurnReason(j?.error || j?.message || "動画の文字焼き込みに失敗しました");
      return;
    }

    const burned = String(j?.videoBurnedUrl || "");
    if (!burned) {
      setBurnReason("videoBurnedUrl が取得できません");
      return;
    }

    const cur = Array.isArray(dRef.current.nonAiVideoUrls) ? dRef.current.nonAiVideoUrls : [];
    const nextNonAi = [burned, ...cur.filter((x) => x !== burned)].slice(0, 10);

    setD((p) => ({
      ...p,
      videoSource: "nonai",
      nonAiVideoUrl: burned,
      nonAiVideoUrls: nextNonAi,
    }));

    await saveDraft({
      videoSource: "nonai",
      nonAiVideoUrl: burned,
      nonAiVideoUrls: nextNonAi,
      phase: "draft",
    } as any);

    showMsg("✅ 文字焼き込み動画を保存しました（非AI代表を更新）");
  }

  return {
    applyTopRecommendation,
    fetchRecommendPresets,
    syncVideosFromStorage,
    saveNonAiVideoToDraft,
    burnVideo,
  };
}