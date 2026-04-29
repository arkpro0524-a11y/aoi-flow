//app/flow/drafts/new/components/CaptionEditorCard.tsx
"use client";

import React from "react";
import type { DraftDoc } from "@/lib/types/draft";
import { UI, Btn } from "../ui";

type Props = {
  d: DraftDoc;
  busy: boolean;
  uid: string | null;
  formStyle: React.CSSProperties;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
  onApplyIg3ToOverlayOnly: (text: string) => void | Promise<void>;
  onSaveDraft: () => void | Promise<void>;
  onEnsureDraftId: () => void | Promise<void>;
};

function bulletsToText(list: unknown): string {
  if (!Array.isArray(list)) return "";
  return list.map((v) => String(v ?? "").trim()).filter(Boolean).join("\n");
}

function textToBullets(text: string): string[] {
  return String(text ?? "")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function formatYen(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString()}円`;
}

export default function CaptionEditorCard(props: Props) {
  const {
    d,
    busy,
    uid,
    formStyle,
    setD,
    onApplyIg3ToOverlayOnly,
    onSaveDraft,
    onEnsureDraftId,
  } = props;

  const sellCheck = d.outcome?.sellCheck;

  return (
    <div
      className="rounded-2xl border border-white/12 bg-black/25"
      style={{ padding: UI.cardPadding }}
    >
      {sellCheck ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-white/90 font-black" style={{ fontSize: 13 }}>
                売れる診断結果
              </div>
              <div className="mt-1 text-white/55" style={{ fontSize: 12, lineHeight: 1.6 }}>
                スコア {sellCheck.score}/100 ・ランク {sellCheck.rank} ・{sellCheck.action}
              </div>
            </div>

            <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
              {formatYen(sellCheck.suggestedPriceMin)}〜{formatYen(sellCheck.suggestedPriceMax)}
            </div>
          </div>

          {sellCheck.improvements.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {sellCheck.improvements.slice(0, 3).map((x, i) => (
                <div
                  key={`${x}-${i}`}
                  className="rounded-xl bg-black/25 px-3 py-2 text-xs text-white/75"
                >
                  {x}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        Instagram 本文（編集可）
      </div>
      <textarea
        value={d.ig ?? d.igCaption ?? ""}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            ig: e.target.value,
            igCaption: e.target.value,
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hIG }}
        placeholder="IG本文"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        X 投稿文（編集可）
      </div>
      <textarea
        value={d.x ?? d.xCaption ?? ""}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            x: e.target.value,
            xCaption: e.target.value,
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hX }}
        placeholder="X投稿文"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        Instagram 販売用本文（編集可）
      </div>
      <textarea
        value={d.instagramSales ?? ""}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            instagramSales: e.target.value,
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hIG }}
        placeholder="販売導線を意識したInstagram本文"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        X 販売用投稿文（編集可）
      </div>
      <textarea
        value={d.xSales ?? ""}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            xSales: e.target.value,
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hX }}
        placeholder="販売導線を意識したX投稿文"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        EC商品タイトル（編集可）
      </div>
      <textarea
        value={d.ecTitle ?? ""}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            ecTitle: e.target.value,
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: 80 }}
        placeholder="ECサイト用の商品タイトル"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        EC商品説明文（編集可）
      </div>
      <textarea
        value={d.ecDescription ?? ""}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            ecDescription: e.target.value,
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: 150 }}
        placeholder="ECサイト用の商品説明文"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        EC訴求ポイント（1行1項目・編集可）
      </div>
      <textarea
        value={bulletsToText(d.ecBullets)}
        onChange={(e) =>
          setD((p) => ({
            ...p,
            ecBullets: textToBullets(e.target.value),
          }))
        }
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: 140 }}
        placeholder={`例：
高級感のある質感
日常使いしやすいサイズ感
贈り物にも使いやすいデザイン`}
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        IG短文候補（ig3）※本文は上書きしない
      </div>

      <div className="grid grid-cols-1 gap-2">
        {(d.ig3 ?? []).length === 0 ? (
          <div
            className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/55"
            style={{ fontSize: 13 }}
          >
            まだ候補がありません（文章生成を実行すると入ります）
          </div>
        ) : null}

        {(d.ig3 ?? []).map((t: string, idx: number) => (
          <div
            key={`${idx}-${t.slice(0, 12)}`}
            className="rounded-xl border border-white/10 bg-black/20 p-3"
          >
            <div
              className="text-white/90"
              style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 800 }}
            >
              {t}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Btn
                variant="secondary"
                disabled={busy}
                onClick={() => onApplyIg3ToOverlayOnly(t)}
                title="本文は上書きしない（文字表示だけに使う）"
              >
                文字表示に使う
              </Btn>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn variant="ghost" disabled={!uid || busy} onClick={onSaveDraft}>
          保存
        </Btn>

        <Btn variant="secondary" disabled={!uid || busy} onClick={onEnsureDraftId}>
          下書きIDを確定
        </Btn>
      </div>
    </div>
  );
}