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
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type Brand = "vento" | "riva";
type Phase = "draft";

type DraftRow = {
  id: string;
  userId: string;
  brand: Brand;
  phase: Phase;
  vision: string;
  caption_final: string;
  imageUrl?: string;
  updatedAt?: any;
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

function resolveListImageUrl(data: DocumentData): string | undefined {
  const compositeImageUrl =
    typeof data.compositeImageUrl === "string" ? data.compositeImageUrl.trim() : "";
  if (compositeImageUrl) return compositeImageUrl;

  const aiImageUrl =
    typeof data.aiImageUrl === "string" ? data.aiImageUrl.trim() : "";
  if (aiImageUrl) return aiImageUrl;

  const imageUrl =
    typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
  if (imageUrl) return imageUrl;

  return undefined;
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

  const isAdmin = useMemo(() => isAdminUid(uid), [uid]);

  async function loadDrafts(currentUid: string) {
    try {
      const qy = query(
        collection(db, "drafts"),
        where("userId", "==", currentUid),
        where("phase", "==", "draft"),
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
            phase: "draft",
            vision: typeof data.vision === "string" ? data.vision : "",
            caption_final:
              typeof data.caption_final === "string" ? data.caption_final : "",
            imageUrl: resolveListImageUrl(data),
            updatedAt: data.updatedAt,
            hiddenForUids: Array.isArray(data.hiddenForUids)
              ? data.hiddenForUids.filter((x: unknown) => typeof x === "string")
              : [],
          };
        })
        .filter((x) => !x.hiddenForUids.includes(currentUid));

      setRows(list);
    } catch (e) {
      console.error(e);
      toast.push("下書き一覧の取得に失敗しました");
      setRows([]);
    }
  }

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
          grid-template-columns: ${BRAND_W}px ${THUMB_BOX}px 1fr 120px;
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
      `}</style>

      <div className="h-full flex flex-col">
        <div
          className="shrink-0 border-b border-white/10 bg-black/10 rounded-2xl"
          style={{ padding: PAGE_PAD }}
        >
          <div style={{ fontSize: HEADER_TITLE_PX, fontWeight: 900 }}>
            下書き一覧
          </div>
          <div className="text-sm text-white/60 mt-1">
            DRAFT のみ表示：{rows.length} 件
          </div>
        </div>

        <div className="overflow-y-auto space-y-3" style={{ padding: PAGE_PAD }}>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/10 p-5 text-sm text-white/75">
              下書きがまだありません。
            </div>
          ) : (
            rows.map((d) => (
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
                      {d.imageUrl ? (
                        <img
                          src={d.imageUrl}
                          alt="thumb"
                          draggable={false}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div className="text-xs text-white/40">NO IMAGE</div>
                      )}
                    </Link>

                    <Link
                      href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                      style={{ minWidth: 0 }}
                    >
                      <div className="pcCaption">
                        {d.caption_final || d.vision || "（未入力）"}
                      </div>
                    </Link>

                    <div className="flex items-center justify-end gap-2">
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
                      {d.imageUrl ? (
                        <img
                          src={d.imageUrl}
                          alt="thumb"
                          draggable={false}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div className="text-xs text-white/40">NO IMAGE</div>
                      )}
                    </Link>

                    <Link
                      href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                      className="mCaption"
                    >
                      {d.caption_final || d.vision || "（未入力）"}
                    </Link>

                    <div className="flex flex-wrap gap-2">
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
            ))
          )}
        </div>
      </div>
    </>
  );
}