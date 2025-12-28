// /app/flow/inbox/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type Draft = {
  id: string;
  userId: string;
  brand: "vento" | "riva";
  phase: "draft" | "ready" | "posted";
  vision: string;
  caption_final: string;
  imageUrl?: string;
  updatedAt?: any;
};

/**
 * ✅ INBOX（投稿待ち）を /drafts と同じ「一覧カードUI」に統一する
 * 目的：
 * 1) 紫文字（visitedリンク色）を根絶 → Link に text-white/ visited:text-white を強制
 * 2) “でかすぎ” を解消 → 高さ・幅・文字サイズを一覧標準へ
 * 3) 画像が暴走して巨大化するのを止める → 枠サイズ固定 + imgを100%で閉じ込める
 *
 * 注意：
 * - Firestoreの条件（phase == ready）などロジックは維持
 * - 見た目だけをここで調整
 */

// ===== 一覧としての標準サイズ（PCでもデカすぎない）=====
const UI = {
  headerTitlePx: 20, // 28 → 20
  pagePad: 16,

  cardH: 160,        // 1行カードの高さ
  cardPad: 14,
  colGap: 14,

  brandW: 140,
  plateH: 110,
  brandPx: 20,

  thumbBox: 130,     // 画像枠（正方形）
  titlePx: 20,       // 本文（タイトル扱い）文字サイズ
};

export default function InboxPage() {
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 認証状態を確定（ロジックはそのまま）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ uid確定後、READYだけ購読
  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "drafts"),
      where("userId", "==", uid),
      where("phase", "==", "ready"),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Draft[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setRows(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.push("投稿待ちの取得に失敗しました");
      }
    );

    return () => unsub();
  }, [uid, authLoading, toast]);

  const ready = useMemo(() => rows, [rows]);

  return (
    <div className="h-full flex flex-col">
      {/* ===== ヘッダー ===== */}
      <div className="shrink-0 border-b border-white/10" style={{ padding: UI.pagePad }}>
        <div style={{ fontSize: UI.headerTitlePx, fontWeight: 900 }}>投稿待ち</div>

        {authLoading ? (
          <div className="text-sm text-white/60 mt-1">認証確認中...</div>
        ) : (
          <div className="text-sm text-white/60 mt-1">
            READYのみ表示：{ready.length} 件{loading ? "（読み込み中...）" : ""}
          </div>
        )}
      </div>

      {/* ===== 一覧 ===== */}
      <div className="overflow-y-auto" style={{ padding: UI.pagePad }}>
        {authLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
            認証確認中...
          </div>
        ) : !uid ? (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
            ログインしてください。
          </div>
        ) : ready.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
            投稿待ちがありません。「新規作成 → 投稿待ちにする」で追加されます。
          </div>
        ) : (
          <div className="space-y-3">
            {ready.map((d) => (
              <Link
                key={d.id}
                href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}

                /**
                 * ✅ 紫リンク色を完全に潰す（最重要）
                 * aタグの既定色/visited色が出ても、ここで上書きする
                 */
                className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
              >
                <div
                  className="group rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition"
                  style={{
                    height: UI.cardH,
                    display: "grid",
                    gridTemplateColumns: `${UI.brandW}px ${UI.thumbBox}px 1fr 24px`,
                    columnGap: UI.colGap,
                    alignItems: "center",
                    padding: UI.cardPad,
                  }}
                >
                  {/* 左：ブランド板 */}
                  <div
                    className="rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b]
                               border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)]
                               flex items-center justify-center"
                    style={{ height: UI.plateH }}
                  >
                    <span
                      style={{
                        fontSize: UI.brandPx,
                        fontWeight: 900,
                        letterSpacing: "0.30em",
                        color: "#000",
                      }}
                    >
                      {(d.brand || "vento").toUpperCase()}
                    </span>
                  </div>

                  {/* 中：画像（暴走防止：枠固定 + img 100%） */}
                  <div
                    className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                    style={{
                      width: UI.thumbBox,
                      height: UI.thumbBox,
                      position: "relative",
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
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div className="text-xs text-white/40">NO IMAGE</div>
                    )}
                  </div>

                  {/* 右：本文（1行に収める） */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: UI.titlePx,
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

                    {/* 補助：ステータスを小さく（邪魔なら消してOK） */}
                    <div className="mt-2 text-xs text-white/55">
                      投稿待ち（READY）
                    </div>
                  </div>

                  {/* → */}
                  <div className="text-xl text-white/35 group-hover:text-white/80 transition text-right">
                    →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}