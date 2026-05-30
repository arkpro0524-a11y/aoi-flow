// app/api/cm-generate/route.ts
// 全張り替え

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import RunwayML from "@runwayml/sdk";
import { requireUserFromAuthHeader, getAdminDb } from "@/app/api/_firebase/admin";
import { getIdempotencyKey } from "@/lib/server/idempotency";

type BrandId = "vento" | "riva";
type UiVideoSize = "720x1280" | "1280x720" | "960x960";

const CM_PROMPT_VERSION = "cm_structure_lock_v3_single_angle";

let runwayClient: any = null;

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function safeBrandId(v: unknown): BrandId {
  return safeText(v) === "riva" ? "riva" : "vento";
}

function normalizeSize(v: unknown): UiVideoSize {
  const s = safeText(v);
  if (s === "1280x720") return "1280x720";
  if (s === "960x960") return "960x960";
  return "720x1280";
}

function ratioFromSize(size: UiVideoSize): "720:1280" | "1280:720" | "960:960" {
  if (size === "1280x720") return "1280:720";
  if (size === "960x960") return "960:960";
  return "720:1280";
}

function getRunwayClient() {
  if (runwayClient) return runwayClient;

  const apiKey = process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is missing");

  runwayClient = new RunwayML({
    apiKey,
    runwayVersion: process.env.RUNWAY_VERSION || "2024-11-06",
    defaultHeaders: {
      "X-Runway-Version": process.env.RUNWAY_VERSION || "2024-11-06",
    },
  } as any);

  return runwayClient;
}

function pickTaskId(task: any): string {
  return (
    safeText(task?.id) ||
    safeText(task?.taskId) ||
    safeText(task?.task_id) ||
    safeText(task?.data?.id) ||
    safeText(task?.data?.taskId)
  );
}

function parseWorldSpecText(worldSpecText: string) {
  const raw = safeText(worldSpecText);

  if (!raw) {
    return {
      runwayPrompt: "",
      negativePrompt: "",
      heroSubject: "",
      visualScene: "",
      composition: "",
      motionStyle: "",
      brandMessage: "",
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      runwayPrompt: safeText(parsed?.runwayPrompt),
      negativePrompt: safeText(parsed?.negativePrompt),
      heroSubject: safeText(parsed?.heroSubject),
      visualScene: safeText(parsed?.visualScene),
      composition: safeText(parsed?.composition),
      motionStyle: safeText(parsed?.motionStyle),
      brandMessage: safeText(parsed?.brandMessage),
    };
  } catch {
    return {
      runwayPrompt: raw,
      negativePrompt: "",
      heroSubject: "",
      visualScene: "",
      composition: "",
      motionStyle: "",
      brandMessage: "",
    };
  }
}

function brandVisualInstruction(brandId: BrandId): string {
  if (brandId === "riva") {
    return [
      "Show stationary classic automotive details only:",
      "chrome parts, analog gauges, leather interior, steering wheel details, polished body reflections.",
      "Quiet premium garage studio, refined dark navy atmosphere.",
    ].join(" ");
  }

  return [
    "Show stationary curated vintage objects and material textures:",
    "aged wood, metal, leather, glass, patina, small crafted objects.",
    "Quiet premium vintage interior, soft natural light, refined minimal display.",
  ].join(" ");
}

function structureLockInstruction(): string {
  return [
    "Single fixed angle shot.",
    "Locked-off tripod shot or extremely subtle push-in only.",
    "The hero object must remain stationary and face the same direction for the entire video.",
    "Do not move, rotate, drive, orbit, pass, flip, reverse, or transform the hero object.",
    "Do not show a side-to-back transition or front-back reversal.",
    "Preserve the same object identity, shape, orientation, material, proportions, and position throughout the video.",
    "Use only gentle focus shift, soft light movement, and tiny camera push-in.",
  ].join(" ");
}

function hardNegativeInstruction(): string {
  return [
    "avoid object morphing",
    "avoid object rotation",
    "avoid vehicle driving",
    "avoid passing through frame",
    "avoid front-back reversal",
    "avoid rear becoming front",
    "avoid changing object direction",
    "avoid distorted objects",
    "avoid deformed objects",
    "avoid random letters",
    "avoid fake typography",
    "avoid messy clutter",
  ].join(", ");
}

function limitPromptText(text: string): string {
  return safeText(text).replace(/\s+/g, " ").slice(0, 950);
}

function buildPrompt(input: { brandId: BrandId; worldSpecText: string }) {
  const parsed = parseWorldSpecText(input.worldSpecText);

  const basePrompt =
    parsed.runwayPrompt ||
    [
      `Premium brand commercial for ${input.brandId.toUpperCase()}.`,
      parsed.heroSubject ? `Visible stationary hero object: ${parsed.heroSubject}.` : "",
      parsed.visualScene ? `Scene: ${parsed.visualScene}.` : "",
      parsed.composition ? `Composition: ${parsed.composition}.` : "",
      parsed.brandMessage ? `Brand idea: ${parsed.brandMessage}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

  const prompt = [
    basePrompt,
    brandVisualInstruction(input.brandId),
    "Make physical objects clearly visible, not an empty atmosphere video.",
    structureLockInstruction(),
    "Plain surfaces only.",
    "No readable text, no subtitles, no logo, no watermark.",
    "No signs, no labels, no posters, no books with text, no packaging text.",
    "No people, no hands, no fingers.",
    hardNegativeInstruction(),
    parsed.negativePrompt ? `Avoid: ${parsed.negativePrompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return limitPromptText(prompt);
}

async function startRunwayTextToVideo(input: {
  promptText: string;
  ratio: string;
  duration: 5 | 10;
  idempotencyKey: string;
}) {
  const client = getRunwayClient();

  if (!client?.textToVideo?.create) {
    throw new Error(
      "Runway SDK textToVideo.create is not available. @runwayml/sdk のバージョンを確認してください。"
    );
  }

  return await client.textToVideo.create(
    {
      model: process.env.RUNWAY_CM_MODEL || "gen4.5",
      promptText: limitPromptText(input.promptText),
      ratio: input.ratio,
      duration: input.duration,
    },
    {
      idempotencyKey: input.idempotencyKey,
    }
  );
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = (await req.json().catch(() => ({}))) as any;

    const draftId = safeText(body?.draftId);
    const brandId = safeBrandId(body?.brandId);
    const worldSpecText = safeText(body?.worldSpecText);
    const size = normalizeSize(body?.size);
    const ratio = ratioFromSize(size);
    const duration: 5 | 10 = Number(body?.seconds) === 10 ? 10 : 5;
    const quality = body?.quality === "high" ? "high" : "standard";

    if (!draftId) return NextResponse.json({ ok: false, error: "draftId required" }, { status: 400 });
    if (!worldSpecText) return NextResponse.json({ ok: false, error: "worldSpecText required" }, { status: 400 });

    const db = getAdminDb();
    const draftRef = db.collection("drafts").doc(draftId);
    const snap = await draftRef.get();

    if (!snap.exists) return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });

    const current = snap.data() || {};

    if (String(current.userId || "") !== user.uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const promptText = buildPrompt({ brandId, worldSpecText });

    const idempotencyKey = getIdempotencyKey(req, {
      type: "brand-cm",
      promptVersion: CM_PROMPT_VERSION,
      draftId,
      brandId,
      worldSpecText,
      promptText,
      size,
      duration,
      quality,
    });

    const task = await startRunwayTextToVideo({
      promptText,
      ratio,
      duration,
      idempotencyKey,
    });

    const taskId = pickTaskId(task);
    if (!taskId) throw new Error("Runway taskId is missing");

    const cmPersona = {
      seconds: duration,
      quality,
      template: "brand_cm_worldspec",
      size,
    };

    const cmVideo = {
      provider: "runway",
      taskId,
      status: "queued",
      url: null,
      urls: Array.isArray((current as any).cmVideo?.urls) ? (current as any).cmVideo.urls : [],
      persona: cmPersona,
    };

    const cmApplied = {
      ...(current.cmApplied && typeof current.cmApplied === "object" ? current.cmApplied : {}),
      brandId,
      worldSpecText,
      runwayPrompt: promptText,
      promptVersion: CM_PROMPT_VERSION,
      runwayTaskId: taskId,
      runwayStatus: "queued",
      runwayVideoUrl: null,
      generatedAt: Date.now(),
    };

    await draftRef.set(
      {
        cmVideo,
        cmApplied,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        ok: true,
        taskId,
        id: taskId,
        status: "queued",
        cmVideo,
      },
      { status: 202 }
    );
  } catch (e: any) {
    console.error("[cm-generate] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "cm-generate failed" },
      { status: 500 }
    );
  }
}