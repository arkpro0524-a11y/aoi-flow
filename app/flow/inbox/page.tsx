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
 * ✅ 見た目だけをここで管理（ロジックは触らない）
 * - 1) 紫文字（リンク色）を根絶：Linkに text-white を強制
 * - 2) 一覧として標準サイズに縮小（タイトル・余白・カード・画像）
 * - 3) 画像の“暴走”を完全停止：画像枠の高さ固定＋position:relative＋imgを100%で閉じ込める
 */
const UI = {
  // ===== ヘッダー =====
  headerTitlePx: 20,        // 28 → 20（大きすぎを抑える）
  headerPad: 16,            // p-5(20) → 16

  // ===== 一覧全体 =====
  bodyPad: 16,              // p-5(20) → 16
  rowGap: 12,               // space-y-4(16) → 12

  // ===== カード =====
  cardPad: 14,              // p-5(20) → 14
  cardRadius: 22,           // rounded-3xl相当（pxで固定）

  // ===== 文字 =====
  brandPx: 12,              // ブランド表示
  badgePx: 11,              // 「投稿待ち」バッジ
  textPx: 14,               // 本文
  textLineH: 1.55,

  // ===== 画像 =====
  imgH: 160,                // 高さ固定（小さくしたければ 140 など）
};

export default function InboxPage() {
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * ✅ 認証状態を state として確定させる
   * - スマホ等で “一瞬uidがnullになる” みたいな挙動を抑える
   */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  /**
   * ✅ uid が確定してから Firestore を購読
   * - READY（投稿待ち）だけを監視して一覧化
   */
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
      {/* =========================
          ヘッダー（サイズ縮小）
      ========================= */}
      <div className="shrink-0 border-b border-white/10" style={{ padding: UI.headerPad }}>
        <div style={{ fontSize: UI.headerTitlePx, fontWeight: 900 }}>投稿待ち</div>

        {authLoading ? (
          <div className="text-sm text-white/60 mt-1">認証確認中...</div>
        ) : (
          <div className="text-sm text-white/60 mt-1">
            READYのみ表示：{ready.length} 件{loading ? "（読み込み中...）" : ""}
          </div>
        )}
      </div>

      {/* =========================
          一覧（余白縮小）
      ========================= */}
      <div className="overflow-y-auto" style={{ padding: UI.bodyPad }}>
        <div style={{ display: "grid", gap: UI.rowGap }}>
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
            ready.map((d) => (
              <Link
                key={d.id}
                href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}

                /**
                 * ✅ 紫リンク色を完全に潰す
                 * - Link（aタグ）はブラウザ既定の visited 色が出やすい
                 * - text-white/90 と visited:text-white/90 を強制して “紫” を根絶
                 */
                className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
                style={{ borderRadius: UI.cardRadius }}
              >
                <div
                  className="border border-white/10 bg-black/25 transition hover:bg-black/30"
                  style={{
                    borderRadius: UI.cardRadius,
                    padding: UI.cardPad,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-white/85" style={{ fontSize: UI.brandPx }}>
                      <span className="font-black tracking-[0.22em]">{d.brand.toUpperCase()}</span>
                    </div>

                    <div
                      className="rounded-full bg-white/10 ring-1 ring-white/10 text-white/85"
                      style={{
                        fontSize: UI.badgePx,
                        padding: "6px 10px",
                      }}
                    >
                      投稿待ち
                    </div>
                  </div>

                  <div
                    className="mt-3 line-clamp-2 text-white/90"
                    style={{
                      fontSize: UI.textPx,
                      lineHeight: UI.textLineH as any,
                    }}
                  >
                    {d.caption_final || d.vision || "（本文なし）"}
                  </div>

                  {/* =========================
                      画像（暴走を止める）
                      - 枠の高さを固定
                      - position:relative で「この中だけが世界」にする
                      - img を width/height 100% で閉じ込める
                  ========================= */}
                  {d.imageUrl && (
                    <div
                      className="mt-3 overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10"
                      style={{
                        height: UI.imgH,
                        position: "relative",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={d.imageUrl}
                        alt="img"
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}