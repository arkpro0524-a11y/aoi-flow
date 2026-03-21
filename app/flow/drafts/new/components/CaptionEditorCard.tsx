// /app/flow/drafts/new/components/CaptionEditorCard.tsx
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

  return (
    <div
      className="rounded-2xl border border-white/12 bg-black/25"
      style={{ padding: UI.cardPadding }}
    >
      <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        Instagram 本文（編集可）
      </div>
      <textarea
        value={d.ig}
        onChange={(e) => setD((p) => ({ ...p, ig: e.target.value }))}
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hIG }}
        placeholder="IG本文"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        X 投稿文（編集可）
      </div>
      <textarea
        value={d.x}
        onChange={(e) => setD((p) => ({ ...p, x: e.target.value }))}
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hX }}
        placeholder="X投稿文"
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
        <Btn
          variant="ghost"
          disabled={!uid || busy}
          onClick={onSaveDraft}
        >
          保存
        </Btn>

        <Btn
          variant="secondary"
          disabled={!uid || busy}
          onClick={onEnsureDraftId}
        >
          下書きIDを確定
        </Btn>
      </div>
    </div>
  );
}