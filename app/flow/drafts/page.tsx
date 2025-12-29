// /app/flow/drafts/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  limit,
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
 * ✅ サイズ調整（巨人UIを解消）
 * - ロジック/Firestore/Link は一切触らない
 */
const HEADER_TITLE_PX = 20;
const CARD_H_PC = 160; // ✅ PCの時だけ固定高
const BRAND_W = 140;
const PLATE_H = 110;
const THUMB_BOX = 130;
const THUMB_PAD = 0;
const TITLE_PX = 20;
const BRAND_PX = 20;

const PAGE_PAD = 16;
const CARD_PAD = 14;
const COL_GAP = 14;

export default function DraftsPage() {
  const toast = useToast();
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      return;
    }
    (async () => {
      try {
        const qy = query(
          collection(db, "drafts"),
          where("userId", "==", uid),
          orderBy("updatedAt", "desc"),
          limit(100)
        );

        const snap = await getDocs(qy);

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
      } catch (e) {
        console.error(e);
        toast.push("下書き一覧の取得に失敗しました");
        setRows([]);
      }
    })();
  }, [uid, toast]);

  return (
    <div className="h-full flex flex-col">
      {/* ✅ Tailwindのlg:を使わず、CSSのmedia queryで確実にPC/スマホ分岐 */}
      <style jsx>{`
        .cardGrid {
          display: grid;
          gap: ${COL_GAP}px;
          align-items: center;
          padding: ${CARD_PAD}px;
        }

        /* ✅ スマホ（〜1023px）：縦積み（崩れない） */
        .cardGrid {
          grid-template-columns: 1fr;
          grid-template-rows: auto auto auto;
        }

        .rowTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .thumbBox {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
        }

        /* ✅ PC（1024px以上）：横4カラムに戻す */
        @media (min-width: 1024px) {
          .cardGrid {
            height: ${CARD_H_PC}px;
            grid-template-columns: ${BRAND_W}px ${THUMB_BOX}px 1fr 24px;
            grid-template-rows: 1fr;
          }
          .rowTop {
            display: block;
          }
          .thumbBox {
            width: ${THUMB_BOX}px;
            max-width: ${THUMB_BOX}px;
            margin: 0;
          }
        }
      `}</style>

      <div className="shrink-0 border-b border-white/10" style={{ padding: PAGE_PAD }}>
        <div style={{ fontSize: HEADER_TITLE_PX, fontWeight: 900 }}>下書き一覧</div>
      </div>

      <div className="overflow-y-auto space-y-3" style={{ padding: PAGE_PAD }}>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-white/75">
            下書きがまだありません。
          </div>
        ) : (
          rows.map((d) => (
            <Link
              key={d.id}
              href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
              className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
            >
              <div className="group rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition">
                <div className="cardGrid">
                  {/* ✅ スマホ：上段（ブランド + →） / PC：左列（ブランド） */}
                  <div className="rowTop">
                    <div
                      className="rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b]
                               border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)]
                               flex items-center justify-center"
                      style={{
                        height: PLATE_H,
                        minWidth: BRAND_W, // ✅ スマホでもブランドが潰れない
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
                        {d.brand.toUpperCase()}
                      </span>
                    </div>

                    {/* ✅ スマホだけ右上に矢印（PCは右端列に出る） */}
                    <div className="text-xl text-white/35 group-hover:text-white/80 transition">
                      →
                    </div>
                  </div>

                  {/* ✅ サムネ：スマホは横幅いっぱい（最大420px） */}
                  <div className="thumbBox">
                    <div
                      className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                      style={{
                        width: "100%",
                        height: THUMB_BOX,
                        padding: THUMB_PAD,
                      }}
                    >
                      {d.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
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
                    </div>
                  </div>

                  {/* ✅ タイトル：スマホは改行OK / PCは1行省略 */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: TITLE_PX,
                        fontWeight: 900,
                        lineHeight: 1.15,
                        color: "rgba(255,255,255,0.95)",
                        whiteSpace: "normal", // ✅ スマホは折り返し
                        overflow: "hidden",
                      }}
                      className="md:line-clamp-2"
                    >
                      {d.caption_final || d.vision || "（未入力）"}
                    </div>
                  </div>

                  {/* ✅ PCだけ右端の矢印列（スマホは上段にある） */}
                  <div className="hidden lg:block text-xl text-white/35 group-hover:text-white/80 transition text-right">
                    →
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}