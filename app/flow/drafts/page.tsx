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
 * ✅ 追加：PC/スマホでレイアウトだけ切り替える（CSS media query）
 */
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

        const list: DraftRow[] = snap.docs.map((docu) => {
          const data = docu.data() as DocumentData;
          const brand: Brand = data.brand === "riva" ? "riva" : "vento";
          const phase: Phase =
            data.phase === "ready"
              ? "ready"
              : data.phase === "posted"
              ? "posted"
              : "draft";

          return {
            id: docu.id,
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
    <>
      {/* ✅ PC/スマホのレイアウト分岐はCSS media queryで固定（Tailwind lg: 使わない） */}
      <style jsx>{`
        /* スマホ：縦カード（崩れない） */
        .draftCard {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          padding: ${CARD_PAD}px;
        }

        .topRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .plateBox {
          width: 100%;
          height: 56px; /* スマホは縦長にしない */
        }

        .thumbBox {
          width: 100%;
          aspect-ratio: 1 / 1; /* スマホは正方形で見やすく */
          height: auto;
        }

        .caption {
          font-size: 16px; /* スマホは少し落とす */
          line-height: 1.25;
        }

        .arrow {
          text-align: right;
        }

        /* PC（1024px以上）：元の4カラムを完全再現 */
        @media (min-width: 1024px) {
          .draftCard {
            height: ${CARD_H}px;
            display: grid;
            grid-template-columns: ${BRAND_W}px ${THUMB_BOX}px 1fr 24px;
            column-gap: ${COL_GAP}px;
            align-items: center;
            padding: ${CARD_PAD}px;
          }

          .topRow {
            display: contents; /* PCでは余計な行を作らず、元の配置に戻す */
          }

          .plateBox {
            width: auto;
            height: ${PLATE_H}px;
          }

          .thumbBox {
            width: ${THUMB_BOX}px;
            height: ${THUMB_BOX}px;
            aspect-ratio: auto;
          }

          .caption {
            font-size: ${TITLE_PX}px;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .arrow {
            text-align: right;
          }
        }
      `}</style>

      <div className="h-full flex flex-col">
        <div
          className="shrink-0 border-b border-white/10"
          style={{ padding: PAGE_PAD }}
        >
          <div style={{ fontSize: HEADER_TITLE_PX, fontWeight: 900 }}>
            下書き一覧
          </div>
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
                <div className="group rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition draftCard">
                  {/* スマホ：上段（ブランド＋矢印） / PC：display:contentsで元の配置に戻る */}
                  <div className="topRow">
                    <div
                      className={[
                        "rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b]",
                        "border border-black/25",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)]",
                        "flex items-center justify-center",
                        "plateBox",
                      ].join(" ")}
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

                    {/* スマホだけ矢印をここに置く（PCではdisplay:contentsで最後列へ戻る） */}
                    <div className="text-xl text-white/35 group-hover:text-white/80 transition arrow">
                      →
                    </div>
                  </div>

                  {/* サムネ */}
                  <div
                    className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10 thumbBox"
                    style={{ padding: THUMB_PAD }}
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

                  {/* タイトル */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="caption"
                      style={{
                        fontWeight: 900,
                        color: "rgba(255,255,255,0.95)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {d.caption_final || d.vision || "（未入力）"}
                    </div>
                  </div>

                  {/* PC用の矢印列（スマホでは上にあるので、ここはPCだけ見える形にする）
                      ※ display:contents の影響で二重表示しないように、PCでだけ表示 */
                  }
                  <div className="hidden lg:block text-xl text-white/35 group-hover:text-white/80 transition text-right">
                    →
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}