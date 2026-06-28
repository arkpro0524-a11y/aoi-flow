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
        .draftsShell {
          min-height: 100%;
          padding: 18px 22px 24px;
          color: rgba(255, 255, 255, 0.94);
        }

        .draftsHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 2px 2px 20px;
        }

        .draftsTitle {
          font-size: ${HEADER_TITLE_PX}px;
          line-height: 1.2;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .draftsLead {
          margin-top: 5px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.62);
        }

        .draftsPanel {
          border: 1px solid rgba(148, 199, 255, 0.14);
          border-radius: 18px;
          background:
            radial-gradient(circle at 20% 0%, rgba(28, 79, 130, 0.24), transparent 38%),
            linear-gradient(180deg, rgba(6, 28, 50, 0.64), rgba(3, 20, 37, 0.5));
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          padding: 16px 20px 30px;
        }

        .draftsToolbar {
          display: grid;
          grid-template-columns: minmax(360px, 508px) 1fr;
          gap: 18px;
          align-items: center;
        }

        .phaseTabs {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.11);
          background: rgba(3, 18, 34, 0.34);
        }

        .phaseTab {
          min-height: 44px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 14px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.7);
          transition: 160ms ease;
        }

        .phaseTab:last-child {
          border-right: 0;
        }

        .phaseTabActive {
          background: linear-gradient(180deg, rgba(37, 99, 235, 0.78), rgba(29, 78, 216, 0.72));
          color: white;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 10px 28px rgba(37, 99, 235, 0.26);
        }

        .rightTools {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .viewPill {
          display: inline-flex;
          align-items: center;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background: rgba(6, 26, 47, 0.54);
        }

        .viewButton {
          height: 40px;
          min-width: 46px;
          padding: 0 12px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.62);
          font-size: 12px;
          font-weight: 900;
        }

        .viewButton:last-child {
          border-right: 0;
        }

        .viewButtonActive {
          background: rgba(37, 99, 235, 0.35);
          color: white;
          box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.42);
        }

        .countRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 15px;
          font-weight: 800;
        }

        .draftGrid {
          margin-top: 26px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
        }

        .draftCard {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid rgba(148, 199, 255, 0.16);
          background: rgba(8, 35, 61, 0.78);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: 160ms ease;
        }

        .draftCard:hover {
          transform: translateY(-1px);
          border-color: rgba(96, 165, 250, 0.38);
          background: rgba(10, 42, 72, 0.86);
        }

        .cardImageLink {
          position: relative;
          height: ${THUMB_BOX}px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.055);
        }

        .phaseBadge {
          position: absolute;
          left: 12px;
          top: 12px;
          z-index: 2;
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
          color: white;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
        }

        .phaseBadgeDraft {
          background: rgba(37, 99, 235, 0.92);
        }

        .phaseBadgeReady {
          background: rgba(217, 119, 6, 0.95);
        }

        .phaseBadgePosted {
          background: rgba(22, 163, 74, 0.95);
        }

        .cardBody {
          padding: 16px 18px 16px;
        }

        .cardTitle {
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.96);
          font-size: 16px;
          line-height: 1.35;
          font-weight: 900;
        }

        .cardMeta {
          margin-top: 7px;
          color: rgba(255, 255, 255, 0.58);
          font-size: 13px;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cardActions {
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .actionCluster {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .smallActionButton {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          background: rgba(255, 255, 255, 0.07);
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.8);
          transition: 160ms ease;
        }

        .smallActionButton:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .smallActionButton:disabled {
          opacity: 0.4;
        }

        .listStack {
          margin-top: 20px;
          display: grid;
          gap: 10px;
        }

        .listItem {
          border-radius: 12px;
          border: 1px solid rgba(148, 199, 255, 0.14);
          background: rgba(8, 35, 61, 0.68);
          padding: 12px;
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
        }

        .listThumb {
          height: 76px;
          width: 76px;
          overflow: hidden;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .compactItem {
          border-radius: 12px;
          border: 1px solid rgba(148, 199, 255, 0.14);
          background: rgba(8, 35, 61, 0.68);
          padding: 12px 14px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
        }

        @media (max-width: 1280px) {
          .draftGrid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 980px) {
          .draftsShell {
            padding: 14px;
          }

          .draftsHeader,
          .draftsToolbar {
            grid-template-columns: 1fr;
          }

          .rightTools {
            justify-content: flex-start;
          }

          .draftGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .draftsPanel {
            padding: 12px;
          }

          .phaseTabs {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .draftGrid {
            grid-template-columns: 1fr;
          }

          .listItem,
          .compactItem {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="draftsShell">
        <div className="draftsHeader">
          <div>
            <div className="draftsTitle">下書き一覧</div>
            <div className="draftsLead">
              下書き管理：{filteredRows.length} / {rows.length} 件表示 / 題名は商品名を優先表示
            </div>
          </div>
        </div>

        <div className="draftsPanel">
          <div className="draftsToolbar">
            <div className="phaseTabs">
              <button type="button" onClick={() => setPhaseFilter("all")} className={`phaseTab ${phaseFilter === "all" ? "phaseTabActive" : ""}`}>すべて {phaseCounts.all}</button>
              <button type="button" onClick={() => setPhaseFilter("draft")} className={`phaseTab ${phaseFilter === "draft" ? "phaseTabActive" : ""}`}>作成中 {phaseCounts.draft}</button>
              <button type="button" onClick={() => setPhaseFilter("ready")} className={`phaseTab ${phaseFilter === "ready" ? "phaseTabActive" : ""}`}>投稿中 {phaseCounts.ready}</button>
              <button type="button" onClick={() => setPhaseFilter("posted")} className={`phaseTab ${phaseFilter === "posted" ? "phaseTabActive" : ""}`}>投稿済み {phaseCounts.posted}</button>
            </div>

            <div className="rightTools">
              <div className="viewPill">
                <button type="button" onClick={() => setViewMode("card")} className={`viewButton ${viewMode === "card" ? "viewButtonActive" : ""}`}>カード</button>
                <button type="button" onClick={() => setViewMode("list")} className={`viewButton ${viewMode === "list" ? "viewButtonActive" : ""}`}>リスト</button>
                <button type="button" onClick={() => setViewMode("compact")} className={`viewButton ${viewMode === "compact" ? "viewButtonActive" : ""}`}>コンパクト</button>
              </div>
            </div>
          </div>

          <div className="countRow">
            <div>全 {filteredRows.length} 件</div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-5 text-sm text-white/75">
              下書きがまだありません。
            </div>
          ) : viewMode === "list" ? (
            <div className="listStack">
              {filteredRows.map((d, index) => {
                const displayTitle = resolveDisplayTitle(d);

                return (
                  <div key={d.id} className="listItem">
                    <Link href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`} className="listThumb">
                      {renderThumb(d, true)}
                    </Link>

                    <Link href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`} className="min-w-0">
                      <div className="cardTitle">{displayTitle}</div>
                      <div className="cardMeta">
                        {d.brand.toUpperCase()} / {phaseLabel(d.phase)} / {d.ecTitle ? "商品名" : d.title ? "題名" : d.caption_final ? "生成文" : "未入力"}
                      </div>
                    </Link>

                    <div className="actionCluster justify-end">
                      {renderOrderButtons(d, index)}
                      {renderPhaseButtons(d)}
                      <button type="button" disabled={deleteBusyId === d.id} onClick={() => void softDeleteDraft(d.id)} className="smallActionButton">非表示</button>
                      {isAdmin ? (
                        <button type="button" disabled={deleteBusyId === d.id} onClick={() => void hardDeleteDraft(d.id)} className="smallActionButton border-red-300/25 bg-red-500/15 text-red-100">完全削除</button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "compact" ? (
            <div className="listStack">
              {filteredRows.map((d, index) => {
                const displayTitle = resolveDisplayTitle(d);

                return (
                  <div key={d.id} className="compactItem">
                    <Link href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`} className="cardTitle">
                      {displayTitle}
                    </Link>

                    <div className="actionCluster justify-end">
                      {renderOrderButtons(d, index)}
                      {renderPhaseButtons(d)}
                      <button type="button" disabled={deleteBusyId === d.id} onClick={() => void softDeleteDraft(d.id)} className="smallActionButton">非表示</button>
                      {isAdmin ? (
                        <button type="button" disabled={deleteBusyId === d.id} onClick={() => void hardDeleteDraft(d.id)} className="smallActionButton border-red-300/25 bg-red-500/15 text-red-100">完全削除</button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="draftGrid">
              {filteredRows.map((d, index) => {
                const displayTitle = resolveDisplayTitle(d);
                const badgeClass = d.phase === "ready" ? "phaseBadgeReady" : d.phase === "posted" ? "phaseBadgePosted" : "phaseBadgeDraft";

                return (
                  <div key={d.id} className="draftCard">
                    <Link href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`} className="cardImageLink">
                      <span className={`phaseBadge ${badgeClass}`}>{phaseLabel(d.phase)}</span>
                      {renderThumb(d)}
                    </Link>

                    <div className="cardBody">
                      <Link href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`} className="cardTitle">
                        {displayTitle}
                      </Link>
                      <div className="cardMeta">
                        {d.ecTitle ? "EC商品タイトルを表示" : d.title ? "下書きタイトルを表示" : d.caption_final ? "生成文章を表示" : "商品名未入力"}
                      </div>

                      <div className="cardActions">
                        <div className="actionCluster">
                          {renderOrderButtons(d, index)}
                          {renderPhaseButtons(d)}
                        </div>
                        <div className="actionCluster justify-end">
                          <button type="button" disabled={deleteBusyId === d.id} onClick={() => void softDeleteDraft(d.id)} className="smallActionButton">非表示</button>
                          {isAdmin ? (
                            <button type="button" disabled={deleteBusyId === d.id} onClick={() => void hardDeleteDraft(d.id)} className="smallActionButton border-red-300/25 bg-red-500/15 text-red-100">完全削除</button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
