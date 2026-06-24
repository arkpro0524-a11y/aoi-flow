//app/flow/drafts/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type Brand = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";
type PhaseFilter = "all" | Phase;
type ViewMode = "card" | "list" | "compact";

type DraftRow = {
  id: string;
  userId: string;
  brand: Brand;
  phase: Phase;

  // 下書き一覧の題名は「商品名」を優先します。
  // 既存データとの互換性のため、複数の候補を保持して表示時に優先順位を決めます。
  title: string;
  ecTitle: string;
  productName: string;
  vision: string;
  caption_final: string;

  imageUrl?: string;
  updatedAt?: any;
  displayOrder?: number;
  hiddenForUids: string[];
};

const HEADER_TITLE_PX = 20;

const CARD_H = 160;
const BRAND_W = 140;
const PLATE_H = 110;
const THUMB_BOX = 130;
const THUMB_PAD = 0;
const TITLE_PX = 20;
const BRAND_PX = 20;

const PAGE_PAD = 16;
const CARD_PAD = 14;
const COL_GAP = 14;

const PLATE_CLASS =
  "rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b] border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)] flex items-center justify-center";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveListImageUrl(data: DocumentData): string | undefined {
  const compositeImageUrl = normalizeText(data.compositeImageUrl);
  if (compositeImageUrl) return compositeImageUrl;

  const aiImageUrl = normalizeText(data.aiImageUrl);
  if (aiImageUrl) return aiImageUrl;

  const imageUrl = normalizeText(data.imageUrl);
  if (imageUrl) return imageUrl;

  return undefined;
}

function resolveDisplayTitle(draft: DraftRow): string {
  // 商品名として使われる可能性が高い項目を先に見る。
  // これにより、Vision が一覧タイトルに出る問題を避けます。
  return (
    draft.ecTitle ||
    draft.productName ||
    draft.title ||
    draft.caption_final ||
    draft.vision ||
    "（商品名未入力）"
  );
}

function dateToNumber(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  return 0;
}

function sortDraftRows(rows: DraftRow[]): DraftRow[] {
  return [...rows].sort((a, b) => {
    const aHasOrder = typeof a.displayOrder === "number";
    const bHasOrder = typeof b.displayOrder === "number";

    // 並び替え操作を一度でもした下書きは displayOrder を優先します。
    if (aHasOrder || bHasOrder) {
      const ao = aHasOrder ? Number(a.displayOrder) : Number.MAX_SAFE_INTEGER;
      const bo = bHasOrder ? Number(b.displayOrder) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
    }

    // 既存データは今まで通り、更新日時の新しい順にします。
    return dateToNumber(b.updatedAt) - dateToNumber(a.updatedAt);
  });
}

function isAdminUid(uid: string | null): boolean {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS || "";
  const adminUids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!uid) return false;
  return adminUids.includes(uid);
}

export default function DraftsPage() {
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);
  const [idToken, setIdToken] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [deleteBusyId, setDeleteBusyId] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [phaseBusyId, setPhaseBusyId] = useState("");

  const isAdmin = useMemo(() => isAdminUid(uid), [uid]);

  async function loadDrafts(currentUid: string) {
    try {
      const qy = query(
        collection(db, "drafts"),
        where("userId", "==", currentUid),
        orderBy("updatedAt", "desc"),
        limit(100)
      );

      const snap = await getDocs(qy);

      const list: DraftRow[] = snap.docs
        .map((docu): DraftRow => {
          const data = docu.data() as DocumentData;
          const brand: Brand = data.brand === "riva" ? "riva" : "vento";

          return {
            id: docu.id,
            userId: currentUid,
            brand,
            phase: data.phase === "ready" ? "ready" : data.phase === "posted" ? "posted" : "draft",
            title: normalizeText(data.title),
            ecTitle: normalizeText(data.ecTitle),
            productName: normalizeText(data.productName),
            vision: normalizeText(data.vision),
            caption_final: normalizeText(data.caption_final),
            imageUrl: resolveListImageUrl(data),
            updatedAt: data.updatedAt,
            displayOrder:
              typeof data.displayOrder === "number" ? data.displayOrder : undefined,
            hiddenForUids: Array.isArray(data.hiddenForUids)
              ? data.hiddenForUids.filter((x: unknown) => typeof x === "string")
              : [],
          };
        })
        .filter((x) => !x.hiddenForUids.includes(currentUid));

      setRows(sortDraftRows(list));
    } catch (e) {
      console.error(e);
      toast.push("下書き一覧の取得に失敗しました");
      setRows([]);
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("aoi-flow-draft-view-mode");
    if (saved === "card" || saved === "list" || saved === "compact") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("aoi-flow-draft-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUid(u?.uid ?? null);

      if (u) {
        const token = await u.getIdToken(true).catch(() => "");
        setIdToken(token);
      } else {
        setIdToken("");
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      return;
    }

    void loadDrafts(uid);
  }, [uid]);

  async function persistDisplayOrder(nextRows: DraftRow[]) {
    if (!uid) {
      toast.push("ログイン情報が確認できません");
      return;
    }

    setOrderBusy(true);

    try {
      const batch = writeBatch(db);

      nextRows.forEach((row, index) => {
        batch.update(doc(db, "drafts", row.id), {
          displayOrder: index,
        });
      });

      await batch.commit();
      setRows(nextRows.map((row, index) => ({ ...row, displayOrder: index })));
      toast.push("下書きの表示順を保存しました");
    } catch (e) {
      console.error(e);
      toast.push("表示順の保存に失敗しました");
    } finally {
      setOrderBusy(false);
    }
  }

  async function moveDraft(draftId: string, direction: "up" | "down") {
    const currentIndex = rows.findIndex((row) => row.id === draftId);
    if (currentIndex < 0) return;

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= rows.length) return;

    const nextRows = [...rows];
    const [target] = nextRows.splice(currentIndex, 1);
    nextRows.splice(nextIndex, 0, target);

    setRows(nextRows.map((row, index) => ({ ...row, displayOrder: index })));
    await persistDisplayOrder(nextRows);
  }

  async function softDeleteDraft(draftId: string) {
    if (!uid) {
      toast.push("ログイン情報が確認できません");
      return;
    }

    const ok = window.confirm(
      "この下書きを一覧から非表示にします。\nFirestore本体とStorage画像は削除されません。"
    );

    if (!ok) return;

    setDeleteBusyId(draftId);

    try {
      await updateDoc(doc(db, "drafts", draftId), {
        hiddenForUids: arrayUnion(uid),
      });

      setRows((prev) => prev.filter((x) => x.id !== draftId));
      toast.push("下書きを一覧から非表示にしました");
    } catch (e) {
      console.error(e);
      toast.push("表示上の削除に失敗しました");
    } finally {
      setDeleteBusyId("");
    }
  }

  async function hardDeleteDraft(draftId: string) {
    if (!idToken) {
      toast.push("認証情報が確認できません");
      return;
    }

    const ok = window.confirm(
      "管理者用の完全削除です。\nFirestore上の下書きデータを削除します。\nこの操作は戻せません。"
    );

    if (!ok) return;

    setDeleteBusyId(draftId);

    try {
      const res = await fetch("/api/drafts/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ draftId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "完全削除に失敗しました");
      }

      setRows((prev) => prev.filter((x) => x.id !== draftId));
      toast.push("Firestoreから完全削除しました");
    } catch (e) {
      console.error(e);
      toast.push(e instanceof Error ? e.message : "完全削除に失敗しました");
    } finally {
      setDeleteBusyId("");
    }
  }

  function renderThumb(d: DraftRow, small = false) {
    return d.imageUrl ? (
      <img
        src={d.imageUrl}
        alt="thumb"
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    ) : (
      <div className={small ? "text-[10px] text-white/40" : "text-xs text-white/40"}>
        NO IMAGE
      </div>
    );
  }

  const phaseCounts = useMemo(() => {
    return {
      all: rows.length,
      draft: rows.filter((row) => row.phase === "draft").length,
      ready: rows.filter((row) => row.phase === "ready").length,
      posted: rows.filter((row) => row.phase === "posted").length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (phaseFilter === "all") return rows;
    return rows.filter((row) => row.phase === phaseFilter);
  }, [phaseFilter, rows]);

  function phaseLabel(phase: Phase) {
    if (phase === "ready") return "投稿中";
    if (phase === "posted") return "投稿済み";
    return "作成中";
  }

  function phaseButtonClass(target: PhaseFilter) {
    const active = phaseFilter === target;
    if (target === "draft") return active ? "border-cyan-200/70 bg-cyan-300/20 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,.35)]" : "border-cyan-200/20 bg-cyan-300/8 text-cyan-100/75 hover:bg-cyan-300/15";
    if (target === "ready") return active ? "border-amber-200/70 bg-amber-300/20 text-amber-50 shadow-[0_0_22px_rgba(251,191,36,.35)]" : "border-amber-200/20 bg-amber-300/8 text-amber-100/75 hover:bg-amber-300/15";
    if (target === "posted") return active ? "border-emerald-200/70 bg-emerald-300/20 text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,.35)]" : "border-emerald-200/20 bg-emerald-300/8 text-emerald-100/75 hover:bg-emerald-300/15";
    return active ? "border-blue-200/70 bg-blue-500/30 text-white shadow-[0_0_22px_rgba(59,130,246,.35)]" : "border-white/15 bg-white/10 text-white/70 hover:bg-white/20";
  }

  async function updateDraftPhase(draftId: string, phase: Phase) {
    setPhaseBusyId(draftId);
    try {
      await updateDoc(doc(db, "drafts", draftId), { phase });
      setRows((prev) => prev.map((row) => row.id === draftId ? { ...row, phase } : row));
      toast.push(`状態を「${phaseLabel(phase)}」にしました`);
    } catch (e) {
      console.error(e);
      toast.push("状態の更新に失敗しました");
    } finally {
      setPhaseBusyId("");
    }
  }

  function renderPhaseButtons(d: DraftRow) {
    const base = "rounded-full border px-3 py-1.5 text-[11px] font-black transition disabled:opacity-45";
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {(["draft", "ready", "posted"] as Phase[]).map((phase) => (
          <button
            key={phase}
            type="button"
            disabled={phaseBusyId === d.id || d.phase === phase}
            onClick={() => void updateDraftPhase(d.id, phase)}
            className={`${base} ${d.phase === phase ? phaseButtonClass(phase) : "border-white/12 bg-white/8 text-white/62 hover:bg-white/14"}`}
            title={`この下書きを${phaseLabel(phase)}にする`}
          >
            {phaseLabel(phase)}
          </button>
        ))}
      </div>
    );
  }

  function renderOrderButtons(d: DraftRow, index: number) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={orderBusy || index === 0}
          onClick={() => void moveDraft(d.id, "up")}
          className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs font-black text-white/80 transition hover:bg-white/20 disabled:opacity-35"
          title="この下書きを上へ移動"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={orderBusy || index === rows.length - 1}
          onClick={() => void moveDraft(d.id, "down")}
          className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs font-black text-white/80 transition hover:bg-white/20 disabled:opacity-35"
          title="この下書きを下へ移動"
        >
          ↓
        </button>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .cardPC {
          display: none;
        }
        .cardMobile {
          display: block;
        }

        @media (min-width: 1024px) {
          .cardPC {
            display: block;
          }
          .cardMobile {
            display: none;
          }
        }

        .mWrap {
          padding: ${CARD_PAD}px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .mTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .mPlate {
          height: 56px;
          width: 100%;
        }
        .mThumb {
          width: 100%;
          aspect-ratio: 1 / 1;
          height: auto;
        }
        .mCaption {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pcWrap {
          height: ${CARD_H}px;
          padding: ${CARD_PAD}px;
          display: grid;
          grid-template-columns: ${BRAND_W}px ${THUMB_BOX}px 1fr 168px;
          column-gap: ${COL_GAP}px;
          align-items: center;
        }
        .pcCaption {
          font-size: ${TITLE_PX}px;
          line-height: 1.15;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .listWrap {
          min-height: 92px;
          padding: 12px 14px;
          display: grid;
          grid-template-columns: 76px 1fr 168px;
          gap: 12px;
          align-items: center;
        }
        .compactWrap {
          min-height: 52px;
          padding: 10px 14px;
          display: grid;
          grid-template-columns: 1fr 168px;
          gap: 12px;
          align-items: center;
        }

        @media (max-width: 820px) {
          .listWrap,
          .compactWrap,
          .pcWrap {
            grid-template-columns: 1fr !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .cardPC {
            display: none !important;
          }
          .cardMobile {
            display: block !important;
          }
          .mCaption,
          .pcCaption {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
          }
        }

      `}</style>

      <div className="h-full flex flex-col">
        <div
          className="shrink-0 border-b border-white/10 bg-black/10 rounded-2xl"
          style={{ padding: PAGE_PAD }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div style={{ fontSize: HEADER_TITLE_PX, fontWeight: 900 }}>
                下書き一覧
              </div>
              <div className="text-sm text-white/60 mt-1">
                下書き管理：{filteredRows.length} / {rows.length} 件表示 / 題名は商品名を優先表示
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPhaseFilter("all")} className={`rounded-full border px-3 py-2 text-xs font-black transition ${phaseButtonClass("all")}`}>すべて {phaseCounts.all}</button>
              <button type="button" onClick={() => setPhaseFilter("draft")} className={`rounded-full border px-3 py-2 text-xs font-black transition ${phaseButtonClass("draft")}`}>作成中 {phaseCounts.draft}</button>
              <button type="button" onClick={() => setPhaseFilter("ready")} className={`rounded-full border px-3 py-2 text-xs font-black transition ${phaseButtonClass("ready")}`}>投稿中 {phaseCounts.ready}</button>
              <button type="button" onClick={() => setPhaseFilter("posted")} className={`rounded-full border px-3 py-2 text-xs font-black transition ${phaseButtonClass("posted")}`}>投稿済み {phaseCounts.posted}</button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                  viewMode === "card"
                    ? "border-emerald-200/50 bg-emerald-300/20 text-white"
                    : "border-white/15 bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                カード
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                  viewMode === "list"
                    ? "border-emerald-200/50 bg-emerald-300/20 text-white"
                    : "border-white/15 bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                リスト
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                  viewMode === "compact"
                    ? "border-emerald-200/50 bg-emerald-300/20 text-white"
                    : "border-white/15 bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                コンパクト
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto space-y-3" style={{ padding: PAGE_PAD }}>
          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/10 p-5 text-sm text-white/75">
              下書きがまだありません。
            </div>
          ) : (
            filteredRows.map((d, index) => {
              const displayTitle = resolveDisplayTitle(d);

              if (viewMode === "list") {
                return (
                  <div
                    key={d.id}
                    className="group rounded-2xl border border-white/12 bg-black/10 transition hover:bg-black/20"
                  >
                    <div className="listWrap">
                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="h-[76px] w-[76px] rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                      >
                        {renderThumb(d, true)}
                      </Link>

                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="min-w-0"
                      >
                        <div className="text-lg font-black text-white/95 truncate">
                          {displayTitle}
                        </div>
                        <div className="mt-1 text-xs text-white/50 truncate">
                          {d.brand.toUpperCase()} / {phaseLabel(d.phase)} / {d.ecTitle ? "商品名" : d.title ? "題名" : d.caption_final ? "生成文" : "未入力"}
                        </div>
                      </Link>

                      <div className="flex items-center justify-end gap-2">
                        {renderOrderButtons(d, index)}
                        {renderPhaseButtons(d)}
                        <button
                          type="button"
                          disabled={deleteBusyId === d.id}
                          onClick={() => void softDeleteDraft(d.id)}
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/80 transition hover:bg-white/20 disabled:opacity-50"
                        >
                          非表示
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (viewMode === "compact") {
                return (
                  <div
                    key={d.id}
                    className="group rounded-2xl border border-white/12 bg-black/10 transition hover:bg-black/20"
                  >
                    <div className="compactWrap">
                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="min-w-0"
                      >
                        <div className="text-base font-black text-white/95 truncate">
                          {displayTitle}
                        </div>
                      </Link>

                      <div className="flex items-center justify-end gap-2">
                        {renderOrderButtons(d, index)}
                        {renderPhaseButtons(d)}
                        <button
                          type="button"
                          disabled={deleteBusyId === d.id}
                          onClick={() => void softDeleteDraft(d.id)}
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/80 transition hover:bg-white/20 disabled:opacity-50"
                        >
                          非表示
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={d.id}
                  className="group rounded-2xl border border-white/12 bg-black/10 transition hover:bg-black/20"
                >
                  <div className="cardPC">
                    <div className="pcWrap">
                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className={PLATE_CLASS}
                        style={{ height: PLATE_H }}
                      >
                        <span
                          style={{
                            fontSize: BRAND_PX,
                            fontWeight: 900,
                            letterSpacing: "0.30em",
                            color: "#000",
                          }}
                        >
                          {d.brand.toUpperCase()}
                        </span>
                      </Link>

                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                        style={{
                          width: THUMB_BOX,
                          height: THUMB_BOX,
                          padding: THUMB_PAD,
                        }}
                      >
                        {renderThumb(d)}
                      </Link>

                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        style={{ minWidth: 0 }}
                      >
                        <div className="pcCaption">{displayTitle}</div>
                        <div className="mt-2 text-xs text-white/50 truncate">
                          {d.ecTitle ? "EC商品タイトルを表示" : d.title ? "下書きタイトルを表示" : d.caption_final ? "生成文章を表示" : "商品名未入力"}
                        </div>
                      </Link>

                      <div className="flex items-center justify-end gap-2">
                        {renderOrderButtons(d, index)}
                        {renderPhaseButtons(d)}

                        <button
                          type="button"
                          disabled={deleteBusyId === d.id}
                          onClick={() => void softDeleteDraft(d.id)}
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/80 transition hover:bg-white/20 disabled:opacity-50"
                        >
                          非表示
                        </button>

                        {isAdmin ? (
                          <button
                            type="button"
                            disabled={deleteBusyId === d.id}
                            onClick={() => void hardDeleteDraft(d.id)}
                            className="rounded-full border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/25 disabled:opacity-50"
                          >
                            完全削除
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="cardMobile">
                    <div className="mWrap">
                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="mTop"
                      >
                        <div className={`${PLATE_CLASS} mPlate`}>
                          <span
                            style={{
                              fontSize: 16,
                              fontWeight: 900,
                              letterSpacing: "0.25em",
                              color: "#000",
                            }}
                          >
                            {d.brand.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xl text-white/35 group-hover:text-white/80 transition text-right">
                          →
                        </div>
                      </Link>

                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="mThumb rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                        style={{ padding: THUMB_PAD }}
                      >
                        {renderThumb(d)}
                      </Link>

                      <Link
                        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                        className="mCaption"
                      >
                        {displayTitle}
                      </Link>

                      <div className="flex flex-wrap gap-2">
                        {renderOrderButtons(d, index)}
                        {renderPhaseButtons(d)}

                        <button
                          type="button"
                          disabled={deleteBusyId === d.id}
                          onClick={() => void softDeleteDraft(d.id)}
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/80 transition hover:bg-white/20 disabled:opacity-50"
                        >
                          非表示
                        </button>

                        {isAdmin ? (
                          <button
                            type="button"
                            disabled={deleteBusyId === d.id}
                            onClick={() => void hardDeleteDraft(d.id)}
                            className="rounded-full border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/25 disabled:opacity-50"
                          >
                            完全削除
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
