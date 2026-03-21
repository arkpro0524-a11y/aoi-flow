// /app/flow/drafts/new/components/BrandVisionCard.tsx
"use client";

import React from "react";
import type { DraftDoc } from "@/lib/types/draft";
import { UI, Btn, Chip, PhotoSubmissionGuide } from "../ui";

type Props = {
  d: DraftDoc;
  brandLabel: string;
  phaseLabel: string;
  uiMsg: string;
  canGenerate: boolean;
  formStyle: React.CSSProperties;
  onSelectVento: () => void;
  onSelectRiva: () => void;
  onGenerateCaptions: () => void | Promise<void>;
  setD: React.Dispatch<React.SetStateAction<DraftDoc>>;
};

export default function BrandVisionCard(props: Props) {
  const {
    d,
    brandLabel,
    phaseLabel,
    uiMsg,
    canGenerate,
    formStyle,
    onSelectVento,
    onSelectRiva,
    onGenerateCaptions,
    setD,
  } = props;

  return (
    <div
      className="rounded-2xl border border-white/12 bg-black/25"
      style={{ padding: UI.cardPadding }}
    >
      <div className="text-white/80 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        Brand
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Btn
          variant={d.brand === "vento" ? "primary" : "secondary"}
          onClick={onSelectVento}
        >
          VENTO
        </Btn>

        <Btn
          variant={d.brand === "riva" ? "primary" : "secondary"}
          onClick={onSelectRiva}
        >
          RIVA
        </Btn>

        <Chip>
          {brandLabel} / {phaseLabel}
        </Chip>
      </div>

      {uiMsg ? (
        <div
          className="mt-2 text-white/70 font-bold"
          style={{ fontSize: UI.FONT.labelPx }}
        >
          {uiMsg}
        </div>
      ) : null}

      <PhotoSubmissionGuide />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        Vision（必須）
      </div>
      <textarea
        value={d.vision ?? ""}
        onChange={(e) => setD((p) => ({ ...p, vision: e.target.value }))}
        className="w-full rounded-xl border p-3 outline-none"
        style={{ ...formStyle, minHeight: UI.hVision }}
        placeholder="例：流行や価格ではなく、時間が残した佇まいを見る。"
      />

      <div className="text-white/80 mt-4 mb-2" style={{ fontSize: UI.FONT.labelPx }}>
        Keywords（任意）
      </div>
      <input
        value={d.keywordsText}
        onChange={(e) => setD((p) => ({ ...p, keywordsText: e.target.value }))}
        className="w-full rounded-xl border p-3 outline-none"
        style={formStyle}
        placeholder="例：ビンテージ, 静けさ, 選別, 余白"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn
          variant="primary"
          disabled={!canGenerate}
          onClick={onGenerateCaptions}
        >
          文章を生成（IG＋X）
        </Btn>
      </div>
    </div>
  );
}