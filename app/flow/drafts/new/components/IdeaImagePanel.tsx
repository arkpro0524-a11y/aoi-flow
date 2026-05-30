// /app/flow/drafts/new/components/IdeaImagePanel.tsx
"use client";

import React from "react";
import { Btn } from "../ui";

/**
 * ③ 使用シーン（AI再生成）
 *
 * 今回の変更
 * - 旧「イメージ画像（世界観・雰囲気）」の表示名を変更
 * - ボタン名や説明文も変更
 * - ただし中で呼ぶ関数名 generateAiImage は既存のまま使う
 *
 * 理由
 * - まずUIだけ整理して、既存ロジックを壊さないため
 * - APIや中身の生成方針は次段で差し替えやすい形にする
 */

type Props = {
  d: any;
  uid: string | null;
  busy: boolean;
  canGenerate: boolean;
  generateAiImage: () => Promise<void>;
  syncIdeaImagesFromStorage: () => Promise<void>;
  clearIdeaHistory: () => void;
  setD: any;
  saveDraft: any;
  showMsg: (msg: string) => void;
};

export default function IdeaImagePanel({
  d,
  uid,
  busy,
  canGenerate,
  generateAiImage,
  syncIdeaImagesFromStorage,
  clearIdeaHistory,
  setD,
  saveDraft,
  showMsg,
}: Props) {
  return (
    <details className="area3 rounded-2xl border border-white/10 bg-black/20">
      <summary className="cursor-pointer select-none p-3">
        <div className="text-white/70" style={{ fontSize: 12 }}>
          ③ 使用シーン（AI再生成）
        </div>
      </summary>

      <div className="p-3 pt-0">
        {d.imageIdeaUrl ? (
          <img
            src={d.imageIdeaUrl}
            alt="usage-scene"
            className="w-full rounded-xl border border-white/10"
            style={{
              height: 240,
              objectFit: "contain",
              background: "rgba(0,0,0,0.25)",
            }}
          />
        ) : (
          <div
            className="w-full rounded-xl border border-white/10 bg-black/30 flex items-center justify-center text-white/55"
            style={{ aspectRatio: "1 / 1", fontSize: 13 }}
          >
            使用シーン画像がありません
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn
            variant="secondary"
            disabled={!canGenerate}
            onClick={async () => {
              try {
                await generateAiImage();
                showMsg("使用シーン画像を生成しました");
              } catch (e: any) {
                console.error(e);
                showMsg(`生成失敗: ${e?.message || "不明"}`);
              }
            }}
            title="元画像をもとに、使用シーン向けのAI再生成を行います"
          >
            使用シーンを生成
          </Btn>

          <Btn
            variant="secondary"
            disabled={!uid || busy}
            onClick={syncIdeaImagesFromStorage}
          >
            履歴を同期
          </Btn>

          <Btn
            variant="danger"
            disabled={!uid || busy || (d.imageIdeaUrls?.length ?? 0) === 0}
            onClick={clearIdeaHistory}
            title="この下書きの候補リストだけ消します（Storageの画像は消えません）"
          >
            履歴クリア
          </Btn>
        </div>

        <div
          className="text-white/55 mt-2"
          style={{ fontSize: 12, lineHeight: 1.6 }}
        >
          ※ ここは「使用シーン」用です。<br />
          ※ 商品も背景もまとめてAIで再生成する用途を想定しています。<br />
          ※ 今は既存の生成ロジックを使い、見た目だけ先に整理しています。
        </div>

        {(d.imageIdeaUrls?.length ?? 0) > 0 ? (
          <div className="mt-3">
            <div className="text-white/70 mb-2" style={{ fontSize: 12 }}>
              使用シーン履歴（クリックで表示｜課金なし）
            </div>

            <div className="flex flex-col gap-2">
              {(d.imageIdeaUrls ?? []).slice(0, 6).map((u: string) => (
                <button
                  key={u}
                  type="button"
                  disabled={!uid || busy}
                  onClick={() => {
                    setD((p: any) => ({ ...p, imageIdeaUrl: u }));
                    void saveDraft({ imageIdeaUrl: u });
                  }}
                  className={[
                    "text-left rounded-xl border px-3 py-2 transition",
                    !uid || busy ? "opacity-40" : "",
                  ].join(" ")}
                  style={{
                    borderColor: "rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.15)",
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 12,
                  }}
                  title="この画像を③に表示"
                >
                  {u.slice(0, 60)}
                  {u.length > 60 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}