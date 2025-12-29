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
      {/* ✅ lg:等は使わず、CSSのmedia queryでPC/スマホを確実に分岐 */}
      <style jsx>{`
        .page {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .header {
          flex: 0 0 auto;
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .title {
          font-size: 20px;
          font-weight: 900;
        }

        .list {
          padding: 16px;
          overflow-y: auto;
          display: grid;
          gap: 12px;
        }

        /* スマホ：縦カード（サムネ→本文） */
        .card {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          transition: background 0.15s ease;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.9);
        }
        .card:hover {
          background: rgba(0, 0, 0, 0.32);
          color: rgba(255, 255, 255, 1);
        }

        .topRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .brandPlate {
          height: 44px;
          min-width: 120px;
          padding: 0 14px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;

          background: linear-gradient(to bottom, #f2f2f2, #cfcfcf, #9b9b9b);
          border: 1px solid rgba(0, 0, 0, 0.25);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7),
            inset 0 -10px 22px rgba(0, 0, 0, 0.25), 0 8px 18px rgba(0, 0, 0, 0.25);
        }

        .brandPlateText {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0.22em;
          color: #000;
        }

        .arrow {
          font-size: 20px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.35);
          transition: color 0.15s ease;
        }
        .card:hover .arrow {
          color: rgba(255, 255, 255, 0.85);
        }

        .thumbWrap {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .thumbImg {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .noImage {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
        }

        .caption {
          font-size: 16px;
          font-weight: 900;
          line-height: 1.2;
          color: rgba(255, 255, 255, 0.95);

          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          padding: 18px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.75);
        }

        /* PC（1024px以上）：横レイアウト（ブランド｜サムネ｜本文｜→） */
        @media (min-width: 1024px) {
          .card {
            grid-template-columns: 140px 140px 1fr 24px;
            align-items: center;
            gap: 14px;
            min-height: 160px;
          }

          .thumbWrap {
            width: 130px;
            aspect-ratio: 1 / 1;
            justify-self: start;
          }

          .caption {
            font-size: 20px;
          }

          .brandPlate {
            height: 110px;
            min-width: 0;
            width: 140px;
            padding: 0;
          }

          .brandPlateText {
            font-size: 20px;
            letter-spacing: 0.3em;
          }
        }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="title">下書き一覧</div>
        </div>

        <div className="list">
          {rows.length === 0 ? (
            <div className="empty">下書きがまだありません。</div>
          ) : (
            rows.map((d) => (
              <Link
                key={d.id}
                href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                className="card"
              >
                <div className="brandPlate">
                  <span className="brandPlateText">{d.brand.toUpperCase()}</span>
                </div>

                <div className="thumbWrap">
                  {d.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.imageUrl}
                      alt="thumb"
                      draggable={false}
                      className="thumbImg"
                    />
                  ) : (
                    <div className="noImage">NO IMAGE</div>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="caption">
                    {d.caption_final || d.vision || "（未入力）"}
                  </div>
                </div>

                <div className="arrow">→</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}