// /app/flow/inbox/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type Brand = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";

type DraftRow = {
  id: string;
  userId: string;
  brand: Brand;
  phase: Phase;
  vision: string;
  caption_final: string;
  imageUrl?: string;
  updatedAt?: any;
};

/**
 * ✅ PC/スマホ両対応（下書き一覧と同じ見た目）
 * - PC: 4カラム（ブランド / 画像 / タイトル / →）
 * - スマホ: 縦積み（ブランド → 画像 → タイトル →）
 * - Firestoreロジックは変更しない
 */
const HEADER_TITLE_PX = 20;

const PAGE_PAD = 16;
const CARD_PAD = 14;
const COL_GAP = 14;

const CARD_H_PC = 160;

const BRAND_W_PC = 140;
const PLATE_H_PC = 110;

const THUMB_BOX_PC = 130;

const TITLE_PX = 20;
const BRAND_PX = 20;

export default function InboxPage() {
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qy = query(
      collection(db, "drafts"),
      where("userId", "==", uid),
      where("phase", "==", "ready"),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: DraftRow[] = snap.docs.map((doc) => {
          const data = doc.data() as DocumentData;

          const brand: Brand = data.brand === "riva" ? "riva" : "vento";
          const phase: Phase =
            data.phase === "ready"
              ? "ready"
              : data.phase === "posted"
                ? "posted"
                : "draft";

          return {
            id: doc.id,
            userId: uid,
            brand,
            phase,
            vision: typeof data.vision === "string" ? data.vision : "",
            caption_final:
              typeof data.caption_final === "string" ? data.caption_final : "",
            imageUrl:
              typeof data.imageUrl === "string" && data.imageUrl
                ? data.imageUrl
                : undefined,
            updatedAt: data.updatedAt,
          };
        });

        setRows(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setLoading(false);
        toast.push("投稿待ちの取得に失敗しました");
      }
    );

    return () => unsub();
  }, [uid, authLoading, toast]);

  return (
    <>
      {/* ✅ ここだけでPC/スマホ切り替え（Tailwindに依存しない） */}
      <style jsx>{`
        .card {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          transition: 0.15s ease;
          padding: ${CARD_PAD}px;
        }
        .card:hover {
          background: rgba(0, 0, 0, 0.3);
        }

        /* PC（デフォルト） */
        .cardGrid {
          height: ${CARD_H_PC}px;
          display: grid;
          grid-template-columns: ${BRAND_W_PC}px ${THUMB_BOX_PC}px 1fr 24px;
          column-gap: ${COL_GAP}px;
          align-items: center;
        }

        .plate {
          height: ${PLATE_H_PC}px;
        }

        .thumb {
          width: ${THUMB_BOX_PC}px;
          height: ${THUMB_BOX_PC}px;
        }

        /* スマホ（1023px以下）: 縦積み */
        @media (max-width: 1023px) {
          .cardGrid {
            height: auto;
            display: grid;
            grid-template-columns: 1fr;
            row-gap: 10px;
            align-items: stretch;
          }

          .plate {
            height: 64px; /* スマホは薄く */
          }

          .thumb {
            width: 100%;
            height: auto;
            aspect-ratio: 1 / 1; /* 正方形で安定 */
          }

          .arrow {
            display: none; /* スマホは矢印消してスッキリ */
          }

          .title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      `}</style>

      <div className="h-full flex flex-col">
        <div
          className="shrink-0 border-b border-white/10"
          style={{ padding: PAGE_PAD }}
        >
          <div style={{ fontSize: HEADER_TITLE_PX, fontWeight: 900 }}>
            投稿待ち
          </div>

          {authLoading ? (
            <div className="text-sm text-white/60 mt-1">認証確認中...</div>
          ) : (
            <div className="text-sm text-white/60 mt-1">
              READYのみ表示：{rows.length} 件{loading ? "（読み込み中...）" : ""}
            </div>
          )}
        </div>

        <div className="overflow-y-auto" style={{ padding: PAGE_PAD }}>
          {authLoading ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              認証確認中...
            </div>
          ) : !uid ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              ログインしてください。
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              投稿待ちがありません。「新規作成 → 投稿待ちにする」で追加されます。
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((d) => (
                <Link
                  key={d.id}
                  href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                  className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
                >
                  <div className="card">
                    <div className="cardGrid">
                      {/* ブランド */}
                      <div
                        className="rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b] border border-black/25 flex items-center justify-center plate"
                        style={{
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -10px 22px rgba(0,0,0,0.25), 0 8px 18px rgba(0,0,0,0.25)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: BRAND_PX,
                            fontWeight: 900,
                            letterSpacing: "0.30em",
                            color: "#000",
                          }}
                        >
                          {(d.brand || "vento").toUpperCase()}
                        </span>
                      </div>

                      {/* サムネ */}
                      <div className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10 thumb">
                        {d.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.imageUrl}
                            alt="thumb"
                            draggable={false}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain", // ✅ 下書き一覧と同じ（暴れない）
                              display: "block",
                            }}
                          />
                        ) : (
                          <div className="text-xs text-white/40">NO IMAGE</div>
                        )}
                      </div>

                      {/* タイトル */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          className="title"
                          style={{
                            fontSize: TITLE_PX,
                            fontWeight: 900,
                            lineHeight: 1.15,
                            color: "rgba(255,255,255,0.95)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {d.caption_final || d.vision || "（本文なし）"}
                        </div>

                        <div className="mt-2 text-xs text-white/55">
                          投稿待ち（READY）
                        </div>
                      </div>

                      {/* 矢印（PCのみ） */}
                      <div className="arrow text-xl text-white/35 group-hover:text-white/80 transition text-right">
                        →
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}