// /app/flow/drafts/new/VideoPanel.tsx
"use client";

import type { UiVideoSize } from "@/lib/types/draft";

type VideoSeconds = 5 | 10;
type VideoQuality = "standard" | "high";

type Props = {
  uid: string | null;
  draftId: string | null;

  baseImageUrl: string | null;

  initialVideoSeconds?: VideoSeconds;
  initialVideoQuality?: VideoQuality;
  initialVideoSize?: UiVideoSize;

  initialNonAiVideoUrl?: string | null;
  initialVideoUrl?: string | null;

  initialVideoTaskId?: string | null;

  parentBusy?: boolean;
};

export default function VideoPanel(_props: Props) {
  return null;
}