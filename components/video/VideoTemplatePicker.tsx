// /components/video/VideoTemplatePicker.tsx
"use client";

import React, { useMemo, useState } from "react";
import { groupVideoButtons, getVideoButtonById } from "@/lib/videoButtons";
import { clampMotionToRange } from "@/lib/videoRules";
import type { MotionCharacter } from "@/lib/types/draft";
import { useToast } from "@/components/ToastProvider";

/* ========================= */

type Recommended = {
  id: string;
  motionCharacter: MotionCharacter;
  reason?: string;
};

type Props = {
  value: {
    selectedId: string | null;
    motion: MotionCharacter | null;
    recommended: Recommended[];
  };
  onChange: (next: Props["value"]) => void;
  recommendInput: any;
  idToken: string;
};

/* ========================= */

export default function VideoTemplatePicker({
  value,
  onChange,
  recommendInput,
  idToken,
}: Props) {
  const toast = useToast();
  const grouped = useMemo(() => groupVideoButtons(), []);
  const [loading, setLoading] = useState(false);

  function applyChoice(id: string, motion?: MotionCharacter) {
    const b = getVideoButtonById(id);
    if (!b) return;

    const nextMotion = clampMotionToRange(
      id,
      motion ?? value.motion ?? b.defaultMotion
    );

    onChange({
      ...value,
      selectedId: id,
      motion: nextMotion,
    });
  }

  async function runRecommend() {
    setLoading(true);
    try {
      const r = await fetch("/api/recommend-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(recommendInput),
      });

      const j = await r.json();
      const recs: Recommended[] = Array.isArray(j?.recommendedVideos)
        ? j.recommendedVideos
        : [];

      if (!recs.length) {
        toast.push("おすすめ取得失敗");
        return;
      }

      const top = recs[0];

      onChange({
        ...value,
        recommended: recs.slice(0, 3),
        selectedId: top.id,
        motion: clampMotionToRange(top.id, top.motionCharacter),
      });

      toast.push("推奨適用");
    } catch {
      toast.push("おすすめ取得失敗");
    } finally {
      setLoading(false);
    }
  }

  const renderGroup = () => {
    return grouped.map((g: any) => {
      const mids = (g.mids ?? []).filter(
        (m: any) => (m.items ?? []).length > 0
      );

      if (!mids.length) return null;

      return (
        <div key={g.big} className="space-y-2">
          <div className="font-black text-white/85" style={{ fontSize: 13 }}>
            {g.big}
          </div>

          {mids.map((m: any) => (
            <div key={`${g.big}-${m.mid}`} className="space-y-1">
              <div className="text-white/55" style={{ fontSize: 12 }}>
                {m.mid}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {m.items.map((it: any) => {
                  const b = getVideoButtonById(it.id);
                  if (!b) return null;

                  const active = value.selectedId === b.id;

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => applyChoice(b.id)}
                      className="rounded-xl border px-3 py-2 text-left"
                      style={{
                        borderColor: active
                          ? "rgba(255,255,255,0.45)"
                          : "rgba(255,255,255,0.12)",
                        background: active
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.15)",
                        color: "rgba(255,255,255,0.85)",
                      }}
                    >
                      <div className="font-black" style={{ fontSize: 13 }}>
                        {b.small}
                      </div>
                      <div
                        className="opacity-70 mt-1"
                        style={{ fontSize: 12, lineHeight: 1.4 }}
                      >
                        {b.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={runRecommend}
        disabled={loading}
        className="px-3 py-2 border rounded"
      >
        {loading ? "..." : "おすすめ"}
      </button>

      <div className="rounded-2xl border border-white/10 bg-black/15 p-3 space-y-3">
        <div className="text-white/90 font-black" style={{ fontSize: 13 }}>
          非AIテンプレ（売上量産エンジン）
        </div>
        <div
          className="text-white/55"
          style={{ fontSize: 12, lineHeight: 1.5 }}
        >
          崩壊ゼロ。カメラ制御のみ。
        </div>
        {renderGroup()}
      </div>
    </div>
  );
}