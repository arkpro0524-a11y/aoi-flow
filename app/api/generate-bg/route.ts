// app/api/generate-bg/route.ts
import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";
import sharp from "sharp";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";
import { saveBgLog } from "@/app/api/_bgLogs/saveBgLog";
export const runtime = "nodejs";

/**
 * AOI FLOW
 * AI背景生成API
 *
 * v23 の目的
 * - 生成AIの「揺れ」を減らすのではなく、「揺れた画像を通さない」設計にする
 * - keyword を必須の空間解釈条件として固定する
 * - scene / grounding / category の衝突を生成前に補正する
 * - 自由生成1本勝負ではなく、最大2候補を内部生成して比較選抜する
 * - 可視性だけでなく、文脈読解スコアで「白壁だけど通る」を防ぐ
 * - 文脈不足は補正で救済しない。落とす
 * - 黒背景・中央ベタ板・下部破綻は従来どおり補正と判定で抑える
 * - 再試行は最大2候補までに限定して課金暴走を防ぐ
 */

type BgScene = "studio" | "lifestyle" | "scale" | "detail";
type ProductCategory = "furniture" | "goods" | "apparel" | "small" | "other";
type ProductSize = "large" | "medium" | "small";
type GroundingType =
  | "floor"
  | "table"
  | "shelf"
  | "display"
  | "hanging"
  | "wall";
type SellDirection = "sales" | "branding" | "trust" | "story";

/**
 * AI背景の世界観モード
 *
 * study:
 * - 書斎・作業空間らしさを優先
 *
 * lifestyle:
 * - 暮らしの空気・生活感を優先
 *
 * premium:
 * - 高級感・上質感を優先
 */
type BackgroundWorldStyle = "study" | "lifestyle" | "premium";

type KeywordScenario =
  | "entryway"
  | "study"
  | "pharmacy"
  | "hotel"
  | "vintage"
  | "generic";

const AI_BG_VERSION = "v27_front_facing_study_tabletop_composition";
const MAX_GENERATION_ATTEMPTS = 2;

/**
 * このスコア未満は「文脈不足」とみなして不採用
 * 0〜100点換算
 */
const MIN_CONTEXT_READABILITY_SCORE = 56;

/**
 * 総合採用スコア
 * 最後に 2候補を比較するための目安
 */
const MIN_TOTAL_ACCEPT_SCORE = 60;

type ZoneLightStats = {
  mean: number;
  darkPixelRatio: number;
  nearBlackPixelRatio: number;
  blownPixelRatio: number;
  stdDev: number;
};

type ContextReadabilityAnalysis = {
  topContextVariance: number;
  leftContextStrength: number;
  rightContextStrength: number;
  sideContextBalance: number;
  centerIsolationScore: number;
  groundingContinuityScore: number;
  contextReadabilityScore: number;
};

type ImageVisibilityAnalysis = {
  width: number;
  height: number;
  mean: number;
  minChannelMean: number;
  darkPixelRatio: number;
  nearBlackPixelRatio: number;
  blownPixelRatio: number;
  avgStdDev: number;
  centerBand: ZoneLightStats;
  lowerBand: ZoneLightStats;
  centerFlatness: number;
  lowerFlatness: number;
  centerEdgeDensity: number;
  lowerEdgeDensity: number;
  borderGlowRatio: number;
  isolatedNoiseRatio: number;
  horizontalBandingRatio: number;
  centralPlateRatio: number;
  context: ContextReadabilityAnalysis;
};

type CandidateResult = {
  buffer: Buffer;
  before: ImageVisibilityAnalysis;
  after: ImageVisibilityAnalysis;
  attempt: number;
  prompt: string;
  acceptScore: number;
};

type NormalizedGenerationContext = {
  scene: BgScene;
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  backgroundWorldStyle: BackgroundWorldStyle;
  keyword: string;
  keywordScenario: KeywordScenario;
};

type StructureBlueprint = {
  scenario: KeywordScenario;
  title: string;
  upperRole: string;
  leftRole: string;
  rightRole: string;
  lowerRole: string;
  allowedStructures: string[];
  forbiddenAccidents: string[];
  preferredMaterials: string[];
  extraSceneHints: string[];
};

function stableHash(input: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
}

function buildDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

function compactKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function compactConstraints(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeKeyword(input: unknown): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeScene(input: unknown): BgScene {
  const v = String(input ?? "").trim();
  if (v === "studio") return "studio";
  if (v === "lifestyle") return "lifestyle";
  if (v === "scale") return "scale";
  if (v === "detail") return "detail";
  return "studio";
}

function normalizeProductCategory(input: unknown): ProductCategory {
  const v = String(input ?? "").trim();
  if (v === "furniture") return "furniture";
  if (v === "goods") return "goods";
  if (v === "apparel") return "apparel";
  if (v === "small") return "small";
  return "other";
}

function normalizeProductSize(input: unknown): ProductSize {
  const v = String(input ?? "").trim();
  if (v === "large") return "large";
  if (v === "small") return "small";
  return "medium";
}

function normalizeGroundingType(input: unknown): GroundingType {
  const v = String(input ?? "").trim();
  if (v === "table") return "table";
  if (v === "shelf") return "shelf";
  if (v === "display") return "display";
  if (v === "hanging") return "hanging";
  if (v === "wall") return "wall";
  return "floor";
}

function normalizeSellDirection(input: unknown): SellDirection {
  const v = String(input ?? "").trim();
  if (v === "branding") return "branding";
  if (v === "trust") return "trust";
  if (v === "story") return "story";
  return "sales";
}

function normalizeBackgroundWorldStyle(input: unknown): BackgroundWorldStyle {
  const v = String(input ?? "").trim();

  if (v === "lifestyle") return "lifestyle";
  if (v === "premium") return "premium";
  return "study";
}

async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const snap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

function readBrandTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,|、/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

function validateReferenceImageUrl(input: unknown): string {
  const v = String(input ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return "";
}

/**
 * keyword を固定シナリオへ分類する
 * これにより、自由文プロンプトではなく「構造辞書」に落とし込める
 */
function classifyKeywordScenario(keyword: string): KeywordScenario {
  const k = keyword.toLowerCase();

  if (k.includes("玄関") || k.includes("entry")) return "entryway";
  if (k.includes("書斎") || k.includes("study") || k.includes("desk")) return "study";
  if (k.includes("薬局") || k.includes("clinic") || k.includes("受付")) return "pharmacy";
  if (k.includes("ホテル") || k.includes("hotel")) return "hotel";
  if (
    k.includes("ヴィンテージ") ||
    k.includes("アンティーク") ||
    k.includes("vintage") ||
    k.includes("antique")
  ) {
    return "vintage";
  }

  return "generic";
}

/**
 * keyword / scene / category / grounding の衝突を事前補正する
 */
function resolveGenerationContext(args: {
  scene: BgScene;
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  backgroundWorldStyle: BackgroundWorldStyle;
  keyword: string;
}): NormalizedGenerationContext {
  let {
    scene,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    backgroundWorldStyle,
    keyword,
  } = args;

  const keywordScenario = classifyKeywordScenario(keyword);

  const isEntry = keywordScenario === "entryway";
  const isStudy = keywordScenario === "study";
  const isPharmacy = keywordScenario === "pharmacy";
  const isHotel = keywordScenario === "hotel";
  const isVintage = keywordScenario === "vintage";

  if ((isEntry || isStudy || isPharmacy || isHotel) && scene === "studio") {
    scene = "lifestyle";
  }

  if (
    (productCategory === "goods" || productCategory === "small") &&
    groundingType === "floor" &&
    isEntry
  ) {
    groundingType = "shelf";
  }

  if (
    (productCategory === "goods" || productCategory === "small") &&
    groundingType === "floor" &&
    !isEntry &&
    !isHotel &&
    !isVintage
  ) {
    groundingType = "table";
  }

  if (productCategory === "apparel" && groundingType === "table") {
    groundingType = "wall";
  }

  if (productCategory === "furniture" && groundingType === "hanging") {
    groundingType = "floor";
  }

  if (productCategory === "small" && scene === "scale") {
    scene = "detail";
  }

  if (isPharmacy && sellDirection === "story") {
    sellDirection = "trust";
  }

  if (isVintage && scene === "studio") {
    scene = "detail";
  }

  if (
    isEntry &&
    productCategory === "small" &&
    (groundingType === "table" || groundingType === "floor")
  ) {
    groundingType = "shelf";
  }

  return {
    scene,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    backgroundWorldStyle,
    keyword,
    keywordScenario,
  };
}

/**
 * シーン別固定骨格辞書
 * ここが v23 の中核
 */
function buildStructureBlueprint(
  keywordScenario: KeywordScenario,
  scene: BgScene,
  groundingType: GroundingType,
  productCategory: ProductCategory
): StructureBlueprint {
  const commonLowerRole =
    groundingType === "table"
      ? "continuous tabletop plane"
      : groundingType === "floor"
      ? "continuous floor plane"
      : groundingType === "wall"
      ? "calm lower wall zone"
      : "clean hanging support zone";

  if (keywordScenario === "entryway") {
    return {
      scenario: keywordScenario,
      title: "entryway structured place with display surface",
      upperRole: "door frame hint or wall return",
      leftRole: "narrow side depth or restrained threshold-side structure",
      rightRole: "secondary wall return or restrained side depth",
      lowerRole:
        groundingType === "shelf"
          ? "clean entryway shelf or shoe-cabinet-top display plane"
          : groundingType === "display"
          ? "clean narrow display stand plane near entryway"
          : groundingType === "table"
          ? "avoid tabletop, prefer entryway display-surface transition"
          : commonLowerRole,
      allowedStructures: [
        "doorway hint",
        "wall return",
        "threshold-like transition",
        "narrow entry depth",
        "clean wall-floor split",
        "shoe-cabinet-top display surface",
        "entryway shelf surface",
        "narrow decorative placement ledge",
      ],
forbiddenAccidents: [
  "plain blank white wall only",
  "wide hotel lobby feeling",
  "desk-like plane",
  "large empty floor-only composition",
  "umbrella placed on shelf",
  "umbrella placed on cabinet top",
  "umbrella placed on tabletop",
  "umbrella floating above shelf",
  "wall hook visually sitting on shelf",
  "plant placed on main display shelf",
  "shoes on shelf",
  "entry decor props in center",
  "props placed on the future product surface",
],
      preferredMaterials: [
        "painted wall",
        "light stone",
        "light wood",
        "soft neutral plaster",
        "light oak cabinet top",
      ],
      extraSceneHints: [
        "the image should feel like a clean residential or commercial entry threshold",
        "keep the entry feeling architectural, not decorative",
        "prefer a believable small display surface near the entryway for placing a compact object naturally",
        "if a placement plane is visible, it should feel like a shoe-cabinet top, shelf top, or narrow entry display ledge",
      ],
    };
  }

if (keywordScenario === "study") {
  return {
    scenario: keywordScenario,
    title: "cropped real study workspace with partial side context",
    upperRole:
      "subtle upper wall transition or ceiling edge that suggests a real room continuing beyond the frame, not a closed alcove",
    leftRole:
      "partial cropped side context such as a window edge, light source edge, shallow wall return, or one-sided built-in edge",
    rightRole:
      "partial cropped study-side context such as one-sided shelving edge, wall return, or storage edge, never a matching enclosure",
    lowerRole:
      groundingType === "floor"
        ? "prefer a desk-capable plane or stable workspace surface rather than a wide empty floor field"
        : commonLowerRole,
allowedStructures: [
  "front-facing quiet wall plane with visible room depth",
  "straight horizontal desk-capable foreground plane spanning across the lower frame",
  "stable tabletop surface parallel to the bottom edge of the image",
  "partial room edge cropping",
  "asymmetrical side context",
  "window edge or light source at one side",
  "one-sided shelf edge that belongs to the rear wall, not the foreground desk",
  "partial storage structure at one far side with clear separation from the desk plane",
  "subtle ceiling or upper wall transition",
  "cropped built-in edge at only one side",
  "work-space-like structure without props",
  "real room portion with open continuation beyond the frame",
  "clear physical separation between foreground desk surface and rear-side shelving",
  "soft daylight gradient across the center wall",
  "subtle plaster or wall texture in the central negative space",
],
forbiddenAccidents: [
  "bookshelf hero",
  "visible books as the main cue",
  "monitor as hero object",
  "lamp as hero object",
  "stationery in the center",
  "cup in the center",
  "chair as hero object",
  "white wall only",
  "flat blank wall and tabletop only",
  "entryway doorway feel",
  "random wide hall",
  "decorated study room",
  "busy office room",
  "flat wall with a single board only",
  "storage niche without workspace feeling",

  "built-in desk alcove structure that forms a box",
  "surrounded workspace niche",
  "three-sided enclosure feeling",
  "recessed workspace geometry that looks like a tunnel",
  "perfectly symmetrical enclosure forming a box",
  "closed niche or tunnel-like workspace",
  "center framed by identical left and right structures",
  "fully enclosed cubby-like structure",
  "left and right structures both fully visible",
  "room ending inside the frame",

  "bookshelf intersecting with the foreground desk",
  "shelf physically merging into the desk surface",
  "desk surface penetrating into side shelving",
  "impossible join between desk and bookshelf",
  "bookshelf sitting on top of the desk unless clearly designed as a separate rear structure",
  "side shelf and foreground tabletop sharing an impossible plane",
  "broken furniture geometry",
  "ambiguous depth relationship between shelf and desk",

  "diagonal tabletop perspective",
  "side-view room composition",
  "room-corner perspective",
  "desk surface entering diagonally from the left foreground",
  "desk surface entering diagonally from the right foreground",
  "tabletop that does not span horizontally across the lower frame",
  "floor-dominant composition when a tabletop is required",
  "foreground desk plane angled away from the camera",
  "product placement surface viewed from the side",
  "perspective that prevents a front-facing product image from being placed naturally",
],
    preferredMaterials: [
      "matte wall",
      "light oak",
      "soft gray surface",
      "calm plaster",
      "warm neutral wall",
      "subtle wood built-in edge",
    ],
extraSceneHints: [
  "the image should clearly suggest a quiet study or workspace from architecture alone",
  "study meaning should come from a desk-capable plane, partial side depth, window-side structure, one-sided shelf edge, or cropped room architecture",
  "do not let study meaning depend only on books, lamps, monitors, chairs, or decorative objects",
  "small books, soft lighting, or wall art may appear only as subtle peripheral atmosphere",
  "avoid becoming a blank product template; add readable architectural depth only at the far edges",
  "keep the center completely empty and commercially usable for the future product",

  "the scene should feel like a cropped portion of a real room, not a constructed niche",
  "the scene must look like it continues beyond the frame, not ends inside it",
  "the space should feel open beyond the frame edges",
  "avoid showing both left and right structural boundaries fully at the same time",
  "side elements like shelves or windows should appear partially, not symmetrically enclosing the center",
  "prefer one strong cropped side cue and one very quiet opposite side",
  "the environment should feel continuous outside the frame, not closed inside it",
  "the scene must not look like a designed box structure, but like a natural part of a larger room",
  "do not create a boxed alcove, tunnel-like enclosure, cubby, or fully surrounded workspace",

  "the foreground desk surface and any side bookshelf must be physically separate structures",
  "the desk should read as a front-facing horizontal foreground plane, while shelving should read as a rear-side wall structure",
  "the tabletop must span horizontally across the lower foreground like a clean product display surface",
  "the tabletop front edge should be nearly parallel to the bottom edge of the image",
  "do not let the desk angle diagonally from the side into the center",
  "do not let the bookshelf pierce, merge into, or sit unnaturally inside the desk surface",
  "if a bookshelf appears, show a believable vertical side panel or rear wall connection so its depth makes sense",
  "add slightly stronger natural daylight from the left side to create a sense of time and real atmosphere",
  "the center wall should include subtle plaster texture, soft daylight falloff, or gentle tonal variation while remaining empty",
  "the final image must accept a front-facing product cutout placed in the center without perspective mismatch",
],
  };
}
  if (keywordScenario === "pharmacy") {
    return {
      scenario: keywordScenario,
      title: "pharmacy structured place",
      upperRole: "clean commercial upper partition or reception-side wall transition",
      leftRole: "controlled partition line or restrained reception-side depth",
      rightRole: "secondary clean commercial structure",
      lowerRole: commonLowerRole,
      allowedStructures: [
        "clean partition",
        "reception-like wall transition",
        "controlled commercial indoor geometry",
        "clinical clean side depth",
      ],
      forbiddenAccidents: [
        "hotel luxury tone",
        "vintage tone",
        "busy counter crossing center",
        "signage",
        "deep interior clutter",
        "warm wooden boutique feeling",
      ],
      preferredMaterials: ["clean painted wall", "light commercial flooring", "neutral laminate", "soft white panels"],
      extraSceneHints: [
        "the image should feel trustworthy, clean, and commercially usable",
        "pharmacy or reception meaning must come from clean structure, not signage",
      ],
    };
  }

  if (keywordScenario === "hotel") {
    return {
      scenario: keywordScenario,
      title: "hotel structured place",
      upperRole: "hospitality-like upper alcove or refined wall transition",
      leftRole: "controlled hospitality depth",
      rightRole: "secondary elegant side structure",
      lowerRole: commonLowerRole,
      allowedStructures: [
        "refined alcove feel",
        "elegant wall transition",
        "controlled hospitality depth",
        "restrained architectural layering",
      ],
      forbiddenAccidents: [
        "entryway narrow threshold",
        "pharmacy reception feel",
        "desk-like study feel",
        "plain blank white wall only",
        "busy luxury decor",
      ],
      preferredMaterials: ["light stone", "soft beige plaster", "muted wood", "warm neutral wall finish"],
      extraSceneHints: [
        "the image should feel hospitality-like through proportion and material tone only",
        "do not use luxurious objects to fake hotel meaning",
      ],
    };
  }

  if (keywordScenario === "vintage") {
    return {
      scenario: keywordScenario,
      title: "vintage structured place",
      upperRole: "restrained aged material transition",
      leftRole: "controlled vintage-side depth or wall edge character",
      rightRole: "secondary aged architectural cue",
      lowerRole: commonLowerRole,
      allowedStructures: [
        "aged plaster character",
        "subtle patina tone",
        "restrained architectural aging",
        "calm material depth",
      ],
      forbiddenAccidents: [
        "styled antique room display",
        "decor props",
        "white wall only",
        "pharmacy clean commercial feel",
        "hotel lobby feel",
      ],
      preferredMaterials: ["aged plaster", "muted oak", "soft lime wash", "subtle worn stone"],
      extraSceneHints: [
        "vintage meaning should come from material tone and structure, not from old objects",
        "keep the scene commercially usable despite the vintage character",
      ],
    };
  }

  return {
    scenario: "generic",
    title: `${scene} structured place`,
    upperRole: "scene-defining upper architecture",
    leftRole: "secondary readable side-context",
    rightRole: "secondary readable side-context",
    lowerRole: commonLowerRole,
    allowedStructures: [
      "wall transition",
      "side depth",
      "alcove hint",
      "material change",
      "restrained built-in structure",
    ],
    forbiddenAccidents: [
      "plain blank white wall only",
      "random shelves",
      "decorative hero props",
      "fake stage",
      "floating slab",
    ],
    preferredMaterials: ["painted wall", "light wood", "soft stone", "neutral plaster"],
    extraSceneHints: [
      "the space should read as a specific usable place from structure alone",
      "keep the center protected and commercially usable",
    ],
  };
}

function buildEdgePlacementRules(scene: BgScene, groundingType: GroundingType): string[] {
  const base = [
    "Edge placement map is mandatory.",
    "Left edge = readable side-context only.",
    "Right edge = readable side-context only.",
    "Upper edge = readable scene-defining architecture only.",
    "Center = no scene-defining context and no objects.",
    "Lower center = clean readable grounding plane only.",
    "Do not distribute scene meaning randomly across the frame.",
    "Do not let the strongest contextual cue drift into the center zone.",
  ];

  if (scene === "lifestyle") {
    base.push(
      "Use the upper edge for doorway hints, wall transitions, window-side depth, alcove shape, or built-in structure."
    );
    base.push(
      "Use the left or right edge for secondary place cues, never both as competing hero zones."
    );
  }

  if (scene === "studio") {
    base.push(
      "Keep upper edge minimal and controlled, with only restrained material or structural variation."
    );
    base.push(
      "Left and right edges may carry light material change, but not room storytelling."
    );
  }

  if (groundingType === "table") {
    base.push(
      "Lower center must read as a continuous tabletop, not as a line, bar, or pedestal."
    );
  } else if (groundingType === "floor") {
    base.push(
      "Lower center must read as a continuous floor plane, not as a strip or stage."
    );
  } else if (groundingType === "shelf") {
    base.push(
      "Lower center must read as a narrow but believable shelf-top or cabinet-top display plane."
    );
  } else if (groundingType === "display") {
    base.push(
      "Lower center must read as a compact display plane or decorative placement surface, not as a large floor area."
    );
  } else if (groundingType === "wall") {
    base.push(
      "Lower center must stay visually calm so the central wall placement remains usable."
    );
  } else {
    base.push("Upper-center hanging area must remain open and visually quiet.");
  }

  return base;
}

function buildRealisticObjectPlacementRules(keywordScenario: KeywordScenario): string[] {
  const base = [
    "REALISTIC OBJECT PLACEMENT RULES:",
    "Any incidental object must be placed only where it would physically exist in a real room.",
    "Do not place objects on surfaces where they would not normally belong.",
    "Do not place floor items on shelves, cabinet tops, tabletops, or ledges.",
    "Do not place wall-hung items so that they appear to rest on a shelf or cabinet top.",
    "Do not create physically ambiguous object placement.",
    "If an object cannot be placed realistically without interfering with the center product zone, omit the object completely.",
    "Incidental objects are optional. Realistic architecture is more important than props.",
    "Keep all incidental objects small, peripheral, and secondary.",
    "Never let incidental objects become the visual subject.",
  ];

  if (keywordScenario === "entryway") {
    return [
      ...base,
      "Entryway-specific realism:",
      "Umbrellas may appear only in an umbrella stand on the floor, leaning naturally at the side, or hanging clearly from a wall hook.",
      "Umbrellas must never be placed on a shelf, cabinet top, tabletop, shoe cabinet top, ledge, or display surface.",
      "A wall hook for an umbrella must be clearly attached to the wall, not visually sitting above a shelf surface.",
      "Potted plants may appear only on the floor near an edge, or on a clearly separate low side stand, not on the main display shelf.",
      "Shoes may appear only on the floor near the far edge, and only if they are extremely subtle.",
      "Do not place umbrellas, shoes, plants, baskets, keys, trays, or decor in the center placement zone.",
      "The central shelf or cabinet-top display surface must remain empty for the future product.",
    ];
  }

  if (keywordScenario === "study") {
    return [
      ...base,
      "Study-specific realism:",
      "Books, lamps, wall art, small plants, and desk tools may appear only as subtle peripheral atmosphere.",
      "Books may appear only on far-side shelves or cropped shelf edges, not in the center product zone.",
      "Lighting may appear as soft window light, indirect glow, or a very subtle peripheral lamp impression.",
      "A framed picture or wall art may appear only off-center and must remain secondary.",
"If a desk-like surface exists, keep its center completely empty.",
"The desk surface must be a coherent foreground plane and must not intersect with shelves or storage structures.",
"Any bookshelf must belong to the side wall or rear wall and must not merge into the desk surface.",
"The desk must be visually and physically connected to the room architecture, not floating or staged.",
"The desk must feel anchored to the wall or room structure through believable depth, lighting, and perspective.",
"The desk must not appear as an isolated plane detached from the surrounding space.",
"The relationship between desk, wall, and side structures must feel continuous and physically plausible.",
"The workspace must read as part of a larger room, not as a cropped product shooting setup.",
"The space must feel like it extends beyond the frame, not like a closed stage or isolated set.",
"Do not create impossible furniture joints between the desk, shelf, wall, and floor.",
"For study scenes only, avoid a desk placed unnaturally close to the camera.",
"For study scenes only, avoid a foreground-dominant tabletop that feels like a shooting stage.",
"For study scenes only, avoid a desk that is not integrated with the room structure.",
"Do not place study props in the center product zone.",
"Do not let any object become the visual subject.",
    ];
  }

  if (keywordScenario === "pharmacy") {
    return [
      ...base,
      "Pharmacy-specific realism:",
      "Do not include medicines, labels, prescription bags, signage, counters, people, or medical text.",
      "Use clean partitions and reception-like architecture instead of objects.",
    ];
  }

  if (keywordScenario === "hotel") {
    return [
      ...base,
      "Hotel-specific realism:",
      "Do not use luxury props, luggage, lamps, flowers, framed art, or decorative objects as the scene meaning.",
      "Hotel feeling must come from wall proportions, materials, and restrained architectural depth.",
    ];
  }

  if (keywordScenario === "vintage") {
    return [
      ...base,
      "Vintage-specific realism:",
      "Do not use antique props as the main scene cue.",
      "Vintage feeling must come from aged material, patina, muted wood, plaster, and architectural tone.",
    ];
  }

  return base;
}

function buildBaseHardRules(): string[] {
  return [
    "Do NOT create a scene that looks like a product photography stage or isolated shooting setup.",
    "Do NOT include the actual product itself in the generated image.",
    "Do NOT include any people, hands, fingers, arms, or body parts.",
    "Do NOT include any text, watermark, logo, signage, brand mark, or letters.",
    "Do NOT include decorative hero props.",
    "Subtle peripheral atmosphere is allowed when it supports the room world, such as small books, soft lighting, wall art, or quiet shelf details.",
    "Do NOT include clutter, stacked items, styled corners, or busy room-decoration compositions.",
    "Do NOT include haze, fog, mist, glow clouds, dust effects, bloom effects, or smoky white patches.",
    "Do NOT include black walls, crushed blacks, dark voids, or empty black zones.",
    "Do NOT use strong vignette.",
    "Do NOT use spotlight-only lighting with the rest falling into darkness.",
    "Do NOT use dramatic shadows, moody darkness, or cinematic contrast.",
    "Do NOT hide the center placement zone in darkness.",
    "Do NOT hide the lower grounding zone in darkness.",
    "Do NOT blur the scene.",
    "Do NOT use bokeh, soft-focus, shallow depth of field, or artistic lens effects.",
    "The background exists only to support the future product.",
    "The future product must remain the strongest visual hero.",
    "This is a sales background, not an interior-design image and not an artwork.",
    "The composition must feel natural when a product is placed exactly in the center.",
    "Keep the center placement zone wide, open, clean, quiet, and unobstructed.",
    "Leave room for a product occupying roughly 30 to 45 percent of frame width.",
    "Use a front-facing or near-front-facing commercial composition.",
    "Prefer balanced left-right composition.",
    "Use a stable horizontal contact plane when grounding requires it.",
    "The main surface must feel level, sturdy, and commercially usable.",
    "Do not reinterpret or inherit the original product photo background.",
    "The whole frame must remain readable as a selling image.",
    "Keep lighting bright, even, soft, neutral, and natural.",
    "Prefer a clean mid-tone to bright-tone background.",
    "The center area must be brighter than a moody room scene.",
    "The lower grounding area must remain visibly separable from the wall/background.",
    "Keep all visible surfaces crisp, sharp, and well-defined.",
    "Clarity and visibility are more important than mood or storytelling.",
    "A real place feeling is allowed, but the center placement zone must remain protected.",
    "Readable contextual cues may appear only near the far edges or upper edge, never around the center, and must not interfere with the central placement zone.",
    "Do not create a plain blank white template if readable real-place context can be expressed safely.",
    "Readable context is required; vague atmosphere alone is not acceptable.",
    "Scene meaning must come from structure, not from decorative objects.",
    "The viewer should be able to infer what kind of place this is at a glance.",
  ];
}

function buildSceneRules(scene: BgScene): string[] {
  if (scene === "studio") {
    return [
      "Use a controlled studio-like commercial background.",
      "Prefer a simple wall-plane plus stable surface composition.",
      "Keep the center completely open.",
      "Prefer symmetry or near-symmetry.",
      "Avoid room styling.",
      "Use readable but restrained architectural or material variation near the edges so the result does not look like a blank template.",
      "This scene should feel safest for centered product placement.",
      "The scene must still read as an intentional commercial space, not as a generic blank box.",
    ];
  }

  if (scene === "lifestyle") {
    return [
      "This is a lifestyle scene, but it must still function as a selling background first.",
      "Create a clearly readable real indoor living-space context.",
      "The viewer should be able to understand what kind of scene this is from the architecture of the space.",
      "Use readable architectural context such as wall transitions, doorway hints, built-in structure, window-side depth, alcove shape, or material changes.",
      "Do not generate a styled room corner.",
      "Do not generate visible decorative objects near the center.",
      "Keep the center empty for later compositing.",
      "Context must be readable, but still secondary to the future product.",
      "The result must still feel like a sales background first.",
      "Place the readable scene-defining context mainly at the far left, far right, upper edge, or outer depth zones.",
      "The room type must be inferable from structure alone even if all decor is removed.",
    ];
  }

  if (scene === "scale") {
    return [
      "Create a scale-supporting background.",
      "Use readable but restrained environmental cues.",
      "Do not let environmental cues dominate.",
      "Keep the center wide and commercially usable.",
      "Stay simple, calm, and front-oriented.",
      "Support scale perception through readable structure at the edges only.",
      "Scale must be legible from architecture and plane relationships, not from random props.",
    ];
  }

  return [
    "Create a material/detail-supportive background.",
    "Support texture imagination without adding hero props.",
    "Keep the scene low-noise and front-oriented.",
    "Keep the center empty and commercially usable.",
    "Let readable but restrained contextual texture or architectural hints appear only around the outer edges.",
    "Detail support must still read as part of a believable place, not as abstract texture.",
  ];
}

function buildCategoryRules(category: ProductCategory): string[] {
  if (category === "furniture") {
    return [
      "Furniture category.",
      "Prefer floor grounding or a large stable surface.",
      "Keep the wall and floor relationship clear and front-oriented.",
      "Avoid tight room corners.",
      "Avoid extra chairs, tables, shelves, cabinets, lamps, or decor near the center.",
      "The center area must be broad enough for a furniture product.",
      "Use readable but restrained architectural context at the far edges only.",
      "The overall space must feel large enough that a furniture item can be placed naturally without crowding.",
    ];
  }

  if (category === "goods") {
    return [
      "Goods category.",
      "Prefer a stable tabletop or stable small-object presentation surface.",
      "Keep the surface simple and clean.",
      "Avoid decorative tabletop props.",
      "Support material visibility with a quiet background.",
      "Use readable but restrained place context in the upper edge or far side edges only.",
      "The scene must feel commercially usable for a small object without becoming a styled tabletop photo.",
    ];
  }

  if (category === "apparel") {
    return [
      "Apparel category.",
      "Prefer clean wall-oriented environments.",
      "Allow restrained atmosphere only.",
      "Use generous whitespace.",
      "Do not create a styled room or boutique set.",
      "Do not add mannequins, hangers, plants, mirrors, racks, or fashion props.",
      "Use readable but restrained wall texture or architectural cues only.",
      "The place must feel clean and believable for apparel display without looking like a fashion editorial set.",
    ];
  }

  if (category === "small") {
    return [
      "Small product category.",
      "Prefer minimal, clean, sharp environments.",
      "Protect silhouette visibility strongly.",
      "Avoid oversized environmental objects.",
      "Keep visual noise very low.",
      "Use readable but restrained contextual edges so the scene still feels real, not blank.",
      "The environment must not visually dwarf the future product.",
    ];
  }

  return [
    "Other product category.",
    "Keep the scene commercially usable, calm, bright, and center-open.",
    "Use readable but restrained real-place context at the outer edges.",
    "The place must still read as intentionally usable for product display.",
  ];
}

function buildGroundingRules(groundingType: GroundingType): string[] {
  if (groundingType === "floor") {
    return [
      "Grounding type is floor.",
      "A believable floor plane must exist in the center area.",
      "The floor must visually support natural centered product contact.",
      "The horizon or wall-floor split must feel level and stable.",
      "Avoid rugs, steps, benches, pedestals, and objects crossing the center area.",
      "Avoid aggressive perspective on the floor plane.",
      "The lower part of the image must stay bright and readable enough for product grounding.",
      "Any contextual cues must stay above or far to the sides, not crossing the floor center area.",
      "The floor plane must be readable as a real surface, not a thin strip or fake stage.",
    ];
  }

if (groundingType === "table") {
  return [
    "Grounding type is table.",
    "A believable tabletop must exist in the center area.",
    "The tabletop must be wide, level, stable, and uncluttered.",
    "The table surface must support natural centered product placement.",
    "Do not place props on the tabletop.",
    "Do not use diagonal or tilted tabletop perspective.",
    "The lower-middle area must remain readable for product grounding.",
    "Any context must stay off the tabletop center zone.",
    "The tabletop must read as a real continuous surface, not a floating slab or narrow band.",
  ];
}

  if (groundingType === "shelf") {
    return [
      "Grounding type is shelf.",
      "A believable shelf-top or cabinet-top display surface must exist in the lower-center area.",
      "The shelf surface must feel narrow, level, stable, and realistic for displaying a compact product.",
      "The surface must look like part of a real entryway shelf, shoe-cabinet top, or small display ledge.",
      "Keep the display plane uncluttered.",
      "Do not place props on the shelf surface.",
      "Do not make the shelf read like a dining table or wide desk.",
      "The lower-middle area must remain clearly readable as a compact display surface.",
      "The shelf plane must read as a real usable surface, not a floating slab or fake stage.",
    ];
  }

  if (groundingType === "display") {
    return [
      "Grounding type is display.",
      "A believable narrow display stand or decorative placement plane must exist in the lower-center area.",
      "The display surface must feel intentionally designed for placing a compact object.",
      "The display plane must be level, stable, bright, and front-facing.",
      "Keep the area uncluttered and commercially usable.",
      "Do not place props on the display surface.",
      "Do not let the display stand become a hero object.",
      "The lower-middle area must remain clearly readable as a compact display surface.",
      "The display plane must read as a real usable support, not a fake stage or abstract block.",
    ];
  }

  if (groundingType === "hanging") {
    return [
      "Grounding type is hanging.",
      "Leave a clean central hanging area.",
      "Keep the wall plane bright, front-facing, and stable.",
      "Avoid clutter and strong surrounding props.",
      "The center must remain visually quiet.",
      "Use readable but restrained edge context around the upper corners or far sides.",
      "The hanging zone must still feel like part of a believable real place.",
    ];
  }

  return [
    "Grounding type is wall.",
    "Leave a clean central wall-facing placement area.",
    "Keep the wall plane bright, front-facing, and stable.",
    "Avoid wall decor, frames, shelves, plants, or objects around the center.",
    "Keep surrounding context minimal and peripheral.",
    "Use readable but restrained architectural context at the outer edges.",
    "The center wall must stay commercially usable and not turn into a niche, panel, or stage.",
  ];
}

function buildSizeRules(productSize: ProductSize): string[] {
  if (productSize === "large") {
    return [
      "Product size is large.",
      "Background scale must feel spacious enough.",
      "Avoid cramped-looking environments.",
      "The center area should support a large subject naturally.",
      "Use readable but restrained architectural context scaled for a spacious subject.",
      "The room proportions must not make the future product feel oversized or squeezed in.",
    ];
  }

  if (productSize === "small") {
    return [
      "Product size is small.",
      "Avoid oversized environmental cues that dwarf the future product.",
      "Keep scale cues controlled.",
      "The center area should suit a compact subject.",
      "Use readable but restrained contextual hints only.",
      "The scene should feel intentionally composed for a compact product, not accidentally empty.",
    ];
  }

  return [
    "Product size is medium.",
    "Use balanced environmental scale.",
    "The center area should support a medium-sized subject naturally.",
    "The room scale should feel proportionate and commercially usable.",
  ];
}

function buildSellDirectionRules(direction: SellDirection): string[] {
  if (direction === "branding") {
    return [
      "Selling direction is branding.",
      "Allow a little more atmosphere than strict template backgrounds.",
      "Do not reduce visibility for mood.",
      "Do not darken the empty background for atmosphere.",
      "Branding must still remain sales-usable.",
      "Use readable but restrained identity-bearing architectural context at the edges only.",
      "Brand feeling must come from place structure and material choice, not from stylized decor.",
    ];
  }

  if (direction === "trust") {
    return [
      "Selling direction is trust.",
      "Prioritize clarity, cleanliness, and believability.",
      "Avoid dramatic lighting and mood styling.",
      "Make the result feel honest and commercially reliable.",
      "Use readable but restrained contextual structure only.",
      "The background should feel dependable, calm, and clearly usable.",
    ];
  }

  if (direction === "story") {
    return [
      "Selling direction is story.",
      "Support a restrained narrative context.",
      "Do not let the environment become the subject.",
      "Maintain commercial usability and center visibility.",
      "Story must never reduce readability.",
      "Narrative structure may exist at the edges only.",
      "The narrative must be inferable from the place itself, not from props or staging gimmicks.",
    ];
  }

  return [
    "Selling direction is sales.",
    "Prioritize conversion-friendly commercial clarity.",
    "Keep the scene readable and product-supportive.",
    "Usability is more important than mood.",
    "Use readable but restrained place context while keeping the center sterile and safe.",
    "The image should help the future product look immediately listable and sellable.",
  ];
}

function buildBackgroundWorldStyleRules(
  backgroundWorldStyle: BackgroundWorldStyle,
  keywordScenario: KeywordScenario
): string[] {
  if (backgroundWorldStyle === "premium") {
    return [
      "BACKGROUND WORLD STYLE: premium.",
      "This AI background should prioritize atmosphere, brand world, and refined spatial impression.",
      "The result should feel like an upscale interior scene, not a blank ecommerce template.",
      "Allow restrained premium details at the far edges or upper area.",
      "Allowed peripheral details: subtle wall art, indirect lighting, high-quality shelves, books, small ceramic objects, or carefully placed plants.",
      "Keep every detail secondary, quiet, and outside the central product placement zone.",
      "Use warm neutral materials, soft shadows, refined wall texture, light oak, stone, plaster, or muted premium finishes.",
      "Do not make the scene look like a luxury showroom full of props.",
      "Do not place decorative objects in the center area.",
      "The center must remain calm and usable, but the room must not feel empty or sterile.",
    ];
  }

  if (backgroundWorldStyle === "lifestyle") {
    return [
      "BACKGROUND WORLD STYLE: lifestyle.",
      "This AI background should prioritize a believable real-life atmosphere.",
      "The scene may include subtle signs of life at the edges.",
      "Allowed peripheral details: a few books, a small plant, soft daylight, a small framed picture, a quiet shelf, or a gentle lamp glow.",
      "The scene should feel like a cropped portion of a real room, not a constructed template.",
      "Keep the center open for product placement.",
      "Details should fade toward the center and stay stronger only near frame edges.",
      "Avoid clutter, staged decoration, or a room where props become the subject.",
      "Do not make the image sterile; add enough room memory and visual warmth to carry brand world.",
    ];
  }

  if (keywordScenario === "study") {
    return [
      "BACKGROUND WORLD STYLE: study.",
      "This AI background should prioritize a quiet study or workspace atmosphere.",
      "Study feeling may come from peripheral books, a shelf edge, a window edge, warm desk lighting, a small framed artwork, or soft wall texture.",
      "Books are allowed only as small peripheral shelf details, never as the main subject.",
      "A lamp glow is allowed only as indirect or peripheral lighting, not as a visible hero lamp near the center.",
      "A small wall art or framed picture is allowed if it is off-center and secondary.",
      "The center desk or wall area must remain clean and empty for the future product.",
      "The room should feel useful, quiet, intelligent, and lived-in without becoming cluttered.",
      "Avoid pure blank wall and board template feeling.",
    ];
  }

  return [
    "BACKGROUND WORLD STYLE: study.",
    "Use subtle study-like atmosphere while keeping the center clean.",
  ];
}

function buildDesignedWhitespaceRules(
  backgroundWorldStyle: BackgroundWorldStyle
): string[] {
  return [
    "DESIGNED WHITESPACE RULE:",
    "The center must not feel like a plain template background.",
    "The center should remain empty for the future product, but it should contain subtle wall texture, soft daylight gradient, gentle shadow falloff, and natural material variation.",
    "Empty does not mean sterile.",
    "The background should feel like designed negative space in a real room.",
    "Use quiet visual memory around the edges so the room has atmosphere without blocking product placement.",
    "The center product zone must stay clean, but the surrounding world should carry brand mood.",
    "Avoid pure blank wall and pure flat board composition.",
    "Prefer a real photographed room feeling with calm depth, warm light, texture, and peripheral story.",

    backgroundWorldStyle === "premium"
      ? "For premium style, use refined light, calm luxury materials, and carefully restrained edge details."
      : "",

    backgroundWorldStyle === "lifestyle"
      ? "For lifestyle style, use believable lived-in warmth, daylight, and subtle peripheral room details."
      : "",

    backgroundWorldStyle === "study"
      ? "For study style, use quiet intelligence, books or shelf hints at the edge, slightly stronger soft window light from the left, calm wall texture, and a physically coherent workspace atmosphere."
      : "",
  ].filter((rule): rule is string => rule.trim().length > 0);
}

function buildKeywordAssistRules(keyword: string): string[] {
  const keywordScenario = classifyKeywordScenario(keyword);

if (keywordScenario === "entryway") {
  return [
    "Keyword context is mandatory: entryway.",
    "The final scene must be recognizably readable as an entryway from structure alone.",
    "Use readable architectural context at the far edges to express an entry space.",
    "Prefer doorway hint, wall return, threshold feel, narrow side depth, shoe-cabinet-top geometry, or restrained edge transition.",
    "A clean shoe-cabinet-top or entry shelf may exist as the future product placement surface.",
    "The future product placement surface must remain empty.",
    "Umbrellas are allowed only if they are realistically placed in a floor umbrella stand, leaning on the floor at the side, or clearly hanging from a wall hook.",
    "Umbrellas must never be on a shelf, cabinet top, tabletop, ledge, or the future product placement surface.",
    "Plants are allowed only as very subtle peripheral floor objects, never on the main display surface.",
    "Avoid shoes, umbrellas, baskets, benches, frames, plants, or decor near the center.",
    "Keep the center placement area open and bright.",
    "Keep walls, floor, and any display surface visible and readable.",
  ];
}

if (keywordScenario === "study") {
  return [
    "Keyword context is mandatory: study.",
    "The final scene must be recognizably readable as a quiet study or workspace from structure alone.",
    "Do not make the scene a plain blank wall and simple board.",
    "Use readable but restrained architectural context at the far edges to express the study place.",
    "Prefer a desk-capable plane, shallow workspace alcove, side wall return, window-side edge, built-in vertical line, subtle ceiling line, or recessed wall depth.",
    "The study feeling should come from both architecture and restrained peripheral atmosphere.",
    "Small books, soft indirect lighting, or a quiet framed artwork may appear only at the far edges or upper-side background.",
    "Left-side daylight should be slightly visible through soft brightness, gentle shadow falloff, or a natural window-side glow.",
    "The central wall should not be perfectly blank; use subtle plaster texture or soft tonal variation while keeping it empty.",
"If a desk implication exists, it must remain clean, empty, and non-decorative in the center.",
"The desk or tabletop must be front-facing and horizontal so a front-facing product cutout can be placed naturally.",
"The tabletop must run across the lower foreground, not diagonally from one side.",
"A shelf-like structure may include a few small books or quiet objects only at the far edge.",
"Any shelf must be physically separated from the desk plane and must not appear to penetrate, merge with, or rest impossibly inside the tabletop.",
"Avoid stationery, lamps, monitors, chairs, shelves with objects, or styled desk objects near the center.",
"Keep the center area open, bright, and immediately usable for front-facing product placement.",
    "Do not let the back wall disappear into darkness.",
    "Add enough side depth or upper structure so the viewer can imagine the product placed in a real study-like space.",
  ];
}
  if (keywordScenario === "pharmacy") {
    return [
      "Keyword context is mandatory: pharmacy or reception.",
      "The final scene must be recognizably readable as a clean pharmacy-like or reception-like space.",
      "Use readable but restrained architectural context near outer edges.",
      "Prefer clean commercial indoor structure, controlled partitions, restrained counter-side implication, or reception-like wall transitions.",
      "Avoid signage and counters crossing the center area.",
      "Avoid deep busy interiors.",
      "Prefer clear, readable commercial indoor visibility.",
    ];
  }

  if (keywordScenario === "hotel") {
    return [
      "Keyword context is mandatory: hotel.",
      "The final scene must be recognizably readable as a hotel-like space from architecture and material tone.",
      "Use readable but restrained architectural context near outer edges.",
      "Prefer calm hospitality-like wall transitions, restrained alcove feel, or elegant controlled depth.",
      "Avoid busy luxury decor.",
    ];
  }

  if (keywordScenario === "vintage") {
    return [
      "Keyword context is mandatory: vintage or antique.",
      "The final scene must express vintage-like or antique-like place character through structure and material tone.",
      "Express it through restrained material tone and readable peripheral architectural structure.",
      "Do not place vintage props around the center.",
      "Do not turn the image into a styled room display.",
    ];
  }

  return [
    `Keyword context is mandatory: ${keyword}`,
    `The final background must clearly reflect this keyword as a place meaning: ${keyword}.`,
    "Use the keyword as scene-defining guidance, not as decorative flavor.",
    "Use readable but restrained architectural context at the edges only.",
    "The viewer should be able to infer the keyword-related place meaning from structure, material, and edge depth.",
  ];
}

function buildAttemptOverrideRules(attempt: number, groundingType: GroundingType): string[] {
  if (attempt === 1) {
    return [
      "Attempt mode 1.",
      "Create a realistic place-based commercial background.",
      "Use readable but restrained architectural context at the far edges.",
      "Keep the center bright, empty, and protected.",
      "Avoid blank template feeling.",
      "Prioritize generation that passes on the first try.",
      "Build the image as a real wall plus real grounding plane composition first, and only then add readable but restrained architectural context.",
      "Avoid abstract geometry.",
      groundingType === "table"
        ? "Keep tabletop center brighter than wall edges."
        : groundingType === "floor"
        ? "Keep floor center brighter than side edges."
        : "Keep central wall zone brighter than side edges.",
    ];
  }

  return [
    "Attempt mode 2.",
    "Reinforce readable place meaning without adding decorative props.",
    "Strengthen scene legibility through architectural structure, not mood.",
    "The keyword-related place meaning must become clearer than attempt 1.",
    "Use a brighter center and brighter lower grounding area.",
    "Do not allow context to become vague, atmospheric, or generic.",
    "Keep left edge, right edge, and upper edge roles clearly separated.",
    groundingType === "table"
      ? "Reinforce a believable tabletop and wall relationship."
      : groundingType === "floor"
      ? "Reinforce a believable floor and wall relationship."
      : "Reinforce a believable clean central wall relationship.",
  ];
}

function buildVisualBlueprintRules(
  groundingType: GroundingType,
  productCategory: ProductCategory
): string[] {
  const base = [
    "Visual blueprint:",
    "- upper area: clean bright back plane with readable scene-defining architecture only near the upper edge",
    "- left edge: secondary readable side-context only",
    "- right edge: secondary readable side-context only",
    "- center area: completely empty bright placement zone",
    "- lower area: flat stable readable contact plane",
    "- lighting: even, soft, neutral, bright enough for selling",
    "- composition: front-facing, centered, balanced",
  ];

  if (groundingType === "table") {
    base.push("- use a stable tabletop across the lower area");
  } else if (groundingType === "floor") {
    base.push("- use a stable floor plane across the lower area");
  } else if (groundingType === "shelf") {
    base.push("- use a narrow but stable shelf-top or cabinet-top display surface across the lower area");
  } else if (groundingType === "display") {
    base.push("- use a compact display plane or decorative placement ledge across the lower area");
  } else if (groundingType === "wall") {
    base.push("- keep the center wall area empty and unobstructed");
  } else {
    base.push("- keep a clean central hanging zone with minimal surrounding context");
  }

  if (productCategory === "furniture") {
    base.push("- scale should feel spacious and calm");
  }
  if (productCategory === "small") {
    base.push("- avoid oversized environmental cues");
    if (groundingType === "shelf" || groundingType === "display") {
      base.push("- the placement surface should feel suitable for a compact decorative object");
    }
  }

  return base;
}

/**
 * 固定骨格辞書をプロンプトへ展開する
 */
function buildBlueprintRules(blueprint: StructureBlueprint): string[] {
  return [
    `Fixed structure template: ${blueprint.title}.`,
    `Upper edge role: ${blueprint.upperRole}.`,
    `Left edge role: ${blueprint.leftRole}.`,
    `Right edge role: ${blueprint.rightRole}.`,
    `Lower role: ${blueprint.lowerRole}.`,
    "Allowed structural cues:",
    ...blueprint.allowedStructures.map((v) => `- ${v}`),
    "Forbidden accident patterns:",
    ...blueprint.forbiddenAccidents.map((v) => `- ${v}`),
    "Preferred material direction:",
    ...blueprint.preferredMaterials.map((v) => `- ${v}`),
    "Extra scene hints:",
    ...blueprint.extraSceneHints.map((v) => `- ${v}`),
  ];
}

function buildPrompt(args: {
  brandId: string;
  brandName: string;
  vision: string;
  keywords: string[];
  keyword: string;
  scene: BgScene;
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  backgroundWorldStyle: BackgroundWorldStyle;
  styleText: string;
  mergedRules: string[];
  blueprint: StructureBlueprint;
  attempt: number;
}) {
  const {
    brandId,
    brandName,
    vision,
    keywords,
    keyword,
    scene,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    backgroundWorldStyle,
    styleText,
    mergedRules,
    blueprint,
    attempt,
  } = args;

  const sceneInstruction =
    scene === "studio"
      ? "Use a clean studio-like selling background with readable but restrained material or architectural depth at the far edges only."
      : scene === "lifestyle"
      ? "Create a clearly readable living-space context using architecture, wall transitions, floor continuity, built-in structure, doorway hints, or window-side depth, while keeping the center empty and commercially safe."
      : scene === "scale"
      ? "Use readable but restrained scale cues, but do NOT add visible hero objects."
      : "Use a calm detail-supportive background with readable but restrained architectural context, but do NOT add visible props.";

  const groundingInstruction =
    groundingType === "table"
      ? "Bottom zone must be a real flat tabletop, front-facing, level, continuous, and fully readable."
      : groundingType === "floor"
      ? "Bottom zone must be a real flat floor plane, front-facing, level, continuous, and fully readable."
      : groundingType === "shelf"
      ? "Bottom zone must be a real narrow shelf-top or shoe-cabinet-top display surface, front-facing, level, stable, and fully readable."
      : groundingType === "display"
      ? "Bottom zone must be a real compact display stand or decorative placement plane, front-facing, level, stable, and fully readable."
      : groundingType === "wall"
      ? "Keep the wall plane clean and bright with no objects around the center."
      : "Keep a clean bright hanging zone in the center with minimal surrounding context.";

  const structureInstruction =
    groundingType === "table"
      ? "First build a believable back wall and a believable tabletop. The tabletop must look like a real continuous surface, not a line or strip."
      : groundingType === "floor"
      ? "First build a believable back wall and a believable floor plane. The floor must look like a real continuous surface, not a line or strip."
      : groundingType === "shelf"
      ? "First build a believable back wall and a believable narrow shelf-top or cabinet-top display plane. The shelf must look like a real compact usable surface, not a line or strip."
      : groundingType === "display"
      ? "First build a believable back wall and a believable compact display stand or decorative placement plane. The display surface must look real and usable, not abstract geometry."
      : groundingType === "wall"
      ? "First build a believable wall plane with subtle depth and no abstract central panel."
      : "First build a believable wall plane and a clean hanging presentation area without abstract geometry.";

  const keywordRequirement = [
    "KEYWORD INTERPRETATION IS MANDATORY:",
    `- Keyword: ${keyword}`,
    "- The keyword is not optional flavor.",
    "- The final scene must clearly reflect the keyword as a place meaning.",
    "- The viewer should be able to infer the keyword-related place context from structure, planes, and edge architecture.",
    "- Do not satisfy the keyword with decorative props.",
    "- Satisfy the keyword through readable architecture, material transition, and spatial structure.",
  ];

  const edgeRoleRequirement = [
    "EDGE ROLE REQUIREMENT IS MANDATORY:",
    "- Upper edge = primary scene-defining architecture only.",
    "- Left edge = secondary readable side-context only.",
    "- Right edge = secondary readable side-context only.",
    "- Center = no readable scene cue, no props, no structural hero.",
    "- Lower center = only clean readable grounding plane.",
    "- Do not place the strongest context cue in the center.",
    "- Do not let left and right edges compete equally as hero context unless the scene is naturally symmetric.",
  ];

  return [
    "Generate a square commercial product background for later compositing.",
    "Do not include the product itself.",
    "",
    "REALISTIC PHOTO REQUIREMENT:",
    "- The background must look like a real photograph of a clean indoor space.",
    "- Use natural materials such as painted walls, wood floors, or light-colored surfaces.",
    "- Avoid artificial CGI-like surfaces.",
    "- The result must feel like a real place that could be photographed.",
    "",
    "BRIGHTNESS TARGET:",
    "- The scene must be bright indoor lighting, not dramatic.",
    "- Prefer soft daylight or diffused indoor light.",
    "- Avoid dark rooms or shadow-heavy environments.",
    "- The entire image must feel open, clean, and visible.",
    "",
    "LIFESTYLE INTERPRETATION:",
    "- This is NOT a styled interior photo.",
    "- This is NOT a decorated room.",
    "- This is a minimal real living space used as brand-world context.",
    "- Use architecture first, but allow subtle peripheral atmosphere when it improves the world view.",
    "- Small books, soft lighting, wall art, quiet shelf details, or a small plant may appear only at the edges.",
    "",
    "ANTI-CGI RULE:",
    "- Avoid synthetic gradients, glowing panels, or artificial surfaces.",
    "- Avoid overly smooth plastic-like textures.",
    "- Avoid unnatural lighting patterns.",
    "- The image must resemble a real camera photo.",
    "",
    "CONTEXT REQUIREMENT:",
    "- The scene must communicate a clearly readable indoor use context at a glance.",
    "- The viewer should understand what kind of place this is without relying on decorative props.",
    "- Use architectural cues near the far edges to make the room type legible.",
    "- Use wall transitions, doorway hints, built-in structure, edge depth, window-side light, alcove shape, or material changes to define the scene.",
    "- The image should not feel like an empty wall and board template.",
    "- The room context must be readable, but the center placement zone must stay protected.",
    "",
    "SCENE LEGIBILITY RULE:",
    "- Make the background readable as a specific kind of usable indoor scene, not as a generic blank setup.",
    "- The scene should feel intentionally built for a real use context.",
    "- Prefer architectural readability over decorative readability.",
    "- The viewer must be able to tell what kind of scene this is from the structure of the space.",
    "",
    ...keywordRequirement,
    "",
    ...edgeRoleRequirement,
    "",
    "FIXED STRUCTURE TEMPLATE:",
    ...buildBlueprintRules(blueprint),
    "",
    "MANDATORY STRUCTURE:",
    "1) Top zone = clean bright back plane.",
    "2) Center zone = completely empty bright placement zone.",
    "3) Bottom zone = flat stable readable contact plane when grounding is needed.",
    "4) Build the wall/floor/table structure first before adding context.",
    "",
    "CENTER ZONE IS CRITICAL:",
    "- The center zone must be completely empty.",
    "- No objects in the center zone.",
    "- No shadows crossing the center zone.",
    "- No gradients, fog, mist, bloom, haze, glow, or smoky patches in the center zone.",
    "- The center zone must be brighter than the rest of the image.",
    "- The center zone must be immediately usable for placing a real product.",
    "",
    "AI BACKGROUND QUALITY IS CRITICAL:",
    "- The image must feel like a real place, not a blank template background.",
    "- Use readable architectural context at the far left edge, far right edge, or upper edge.",
    "- Context must be readable, structurally clear, and non-competitive with the center.",
    "- Context must come from architectural structure such as wall transitions, doorway hints, built-in structure, depth, or material changes.",
    "- Do NOT use visible decorative hero props to create place feeling.",
    "- Subtle peripheral atmosphere is allowed if it supports the brand world and stays away from the center.",
    "- The wall, floor, or tabletop must read naturally as a real surface.",
    "- Furniture geometry must be physically coherent: shelves, desks, walls, and floors must connect in a believable way.",
    "- If shelving appears at the side, it must be clearly behind or beside the foreground surface, not merged into it.",
    "- The scene must not contain abstract blocks, glowing panels, random frames, or broken geometric artifacts.",
    "- Do not generate a fake central plate, square panel, stage, niche, or floating box shape.",
    "- Do not generate single hard lines pretending to be a floor or table.",
    "- Do not generate edge-glow artifacts, border halos, structural corruption, or random pixel noise.",
    "- The final result must look like a normal photographable interior or studio background, not an AI artifact.",
    "",
    "STRUCTURE-FIRST REQUIREMENT:",
    structureInstruction,
    "",
    "LIGHTING IS CRITICAL:",
    "- Use high readability commercial lighting.",
    "- For study-style backgrounds, allow slightly stronger soft daylight from the left side to create a natural sense of time.",
    "- Even lighting across the whole frame.",
    "- No dark corners.",
    "- No moody lighting.",
    "- No cinematic contrast.",
    "- No spotlight falloff.",
    "- The entire background must be bright and fully visible.",
    "- No dark areas anywhere in the image.",
    "- No black walls or dark gradients.",
    "- The wall and floor must always be clearly visible.",
    "- The image must look like a well-lit studio photo.",
    "",
"COMPOSITION IS CRITICAL:",
"- Front-facing or near-front-facing only.",
"- Balanced left-right composition.",
"- Stable horizontal grounding.",
"- No room-corner composition.",
"- No styled interior composition.",
    "",
    "FORBIDDEN:",
    "- No furniture as a visible subject near center.",
    "- No shelves crossing behind center.",
    "- No plants near center.",
    "- No books near center.",
    "- No frames near center.",
    "- No lamps near center.",
    "- Books, frames, plants, and soft lighting are allowed only as subtle peripheral background elements.",
    "- No mirrors near center.",
    "- No decor near center.",
    "- No props near center.",
    "- No clutter.",
    "- No attention-grabbing side objects.",
    "- No black walls.",
    "- No dark voids.",
    "- Background must NEVER be dark or black.",
    "- Reject any dark scene.",
    "- Prefer light beige, white, light gray environments.",
    "- Reject broken scene geometry.",
    "- Reject noisy artifacted generations.",
"- Reject images where the center becomes a square slab or flat glowing plate.",
    "",
    "SCENE DIRECTION:",
    sceneInstruction,
    groundingInstruction,
    "",
    `Brand: ${brandName || brandId}`,
    `Vision: ${vision}`,
    `Background keyword: ${keyword}`,
    `Scene type: ${scene}`,
    `Product category: ${productCategory}`,
    `Product size: ${productSize}`,
    `Grounding type: ${groundingType}`,
    `Selling direction: ${sellDirection}`,
    `Background world style: ${backgroundWorldStyle}`,
    `Generation attempt: ${attempt}`,
    keywords.length ? `Keywords: ${keywords.join(", ")}` : "",
    styleText ? `Style: ${styleText}` : "",
    "",
    ...buildVisualBlueprintRules(groundingType, productCategory),
    "",
    "FINAL REQUIREMENT:",
    "This must look like a clean ecommerce-ready product background where a product can be placed in the center immediately, while still feeling like a readable real place instead of a plain template.",
    "The keyword-related place meaning must be visible from structure, not guessed from atmosphere.",
    "",
    "Additional rules:",
    ...mergedRules.map((r) => `- ${r}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function calcZoneStats(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number
): ZoneLightStats {
  let sum = 0;
  let sumSq = 0;
  let darkCount = 0;
  let nearBlackCount = 0;
  let blownCount = 0;
  let count = 0;

  const xs = Math.max(0, Math.min(width, xStart));
  const xe = Math.max(xs, Math.min(width, xEnd));
  const ys = Math.max(0, Math.min(height, yStart));
  const ye = Math.max(ys, Math.min(height, yEnd));

  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;

      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luminance;
      sumSq += luminance * luminance;

      if (luminance < 58) darkCount += 1;
      if (luminance < 28) nearBlackCount += 1;
      if (luminance > 245) blownCount += 1;

      count += 1;
    }
  }

  const safeCount = Math.max(1, count);
  const mean = sum / safeCount;
  const variance = Math.max(0, sumSq / safeCount - mean * mean);
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    darkPixelRatio: darkCount / safeCount,
    nearBlackPixelRatio: nearBlackCount / safeCount,
    blownPixelRatio: blownCount / safeCount,
    stdDev,
  };
}

function calcFlatnessAndEdges(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number
) {
  const xs = Math.max(1, Math.min(width - 1, xStart));
  const xe = Math.max(xs + 1, Math.min(width - 1, xEnd));
  const ys = Math.max(1, Math.min(height - 1, yStart));
  const ye = Math.max(ys + 1, Math.min(height - 1, yEnd));

  let flatCount = 0;
  let edgeCount = 0;
  let count = 0;

  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const il = (y * width + (x - 1)) * channels;
      const ir = (y * width + (x + 1)) * channels;
      const iu = ((y - 1) * width + x) * channels;
      const id = ((y + 1) * width + x) * channels;

      const ll =
        0.2126 * (data[il] ?? 0) +
        0.7152 * (data[il + 1] ?? 0) +
        0.0722 * (data[il + 2] ?? 0);
      const lr =
        0.2126 * (data[ir] ?? 0) +
        0.7152 * (data[ir + 1] ?? 0) +
        0.0722 * (data[ir + 2] ?? 0);
      const lu =
        0.2126 * (data[iu] ?? 0) +
        0.7152 * (data[iu + 1] ?? 0) +
        0.0722 * (data[iu + 2] ?? 0);
      const ld =
        0.2126 * (data[id] ?? 0) +
        0.7152 * (data[id + 1] ?? 0) +
        0.0722 * (data[id + 2] ?? 0);

      const gx = Math.abs(lr - ll);
      const gy = Math.abs(ld - lu);
      const grad = gx + gy;

      if (grad < 3.5) flatCount += 1;
      if (grad > 18) edgeCount += 1;

      count += 1;
    }
  }

  const safeCount = Math.max(1, count);
  return {
    flatness: flatCount / safeCount,
    edgeDensity: edgeCount / safeCount,
  };
}

function calcBorderGlowRatio(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number
): number {
  const xStart = Math.round(width * 0.84);
  const xEnd = Math.round(width * 0.98);
  const yStart = Math.round(height * 0.08);
  const yEnd = Math.round(height * 0.92);

  let glowCount = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * width + x) * channels;
      const l =
        0.2126 * (data[i] ?? 0) +
        0.7152 * (data[i + 1] ?? 0) +
        0.0722 * (data[i + 2] ?? 0);

      const il = (y * width + Math.max(0, x - 1)) * channels;
      const left =
        0.2126 * (data[il] ?? 0) +
        0.7152 * (data[il + 1] ?? 0) +
        0.0722 * (data[il + 2] ?? 0);

      if (l > 215 && Math.abs(l - left) > 28) glowCount += 1;
      count += 1;
    }
  }

  return glowCount / Math.max(1, count);
}

function calcIsolatedNoiseRatio(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number
): number {
  let isolated = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * channels;
      const l =
        0.2126 * (data[i] ?? 0) +
        0.7152 * (data[i + 1] ?? 0) +
        0.0722 * (data[i + 2] ?? 0);

      const neighbors = [
        ((y - 1) * width + x) * channels,
        ((y + 1) * width + x) * channels,
        (y * width + (x - 1)) * channels,
        (y * width + (x + 1)) * channels,
      ];

      let farNeighbors = 0;
      for (const n of neighbors) {
        const nl =
          0.2126 * (data[n] ?? 0) +
          0.7152 * (data[n + 1] ?? 0) +
          0.0722 * (data[n + 2] ?? 0);
        if (Math.abs(l - nl) > 40) farNeighbors += 1;
      }

      if (farNeighbors >= 3) isolated += 1;
      count += 1;
    }
  }

  return isolated / Math.max(1, count);
}

function calcHorizontalBandingRatio(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number
): number {
  const yStart = Math.round(height * 0.66);
  const yEnd = Math.round(height * 0.9);
  const xStart = Math.round(width * 0.12);
  const xEnd = Math.round(width * 0.88);

  let strongRowTransitions = 0;
  let rows = 0;

  for (let y = yStart + 1; y < yEnd; y++) {
    let prevRowSum = 0;
    let rowSum = 0;

    for (let x = xStart; x < xEnd; x++) {
      const i1 = ((y - 1) * width + x) * channels;
      const i2 = (y * width + x) * channels;

      prevRowSum +=
        0.2126 * (data[i1] ?? 0) +
        0.7152 * (data[i1 + 1] ?? 0) +
        0.0722 * (data[i1 + 2] ?? 0);
      rowSum +=
        0.2126 * (data[i2] ?? 0) +
        0.7152 * (data[i2 + 1] ?? 0) +
        0.0722 * (data[i2 + 2] ?? 0);
    }

    const rowMean = rowSum / Math.max(1, xEnd - xStart);
    const prevMean = prevRowSum / Math.max(1, xEnd - xStart);

    if (Math.abs(rowMean - prevMean) > 18) strongRowTransitions += 1;
    rows += 1;
  }

  return strongRowTransitions / Math.max(1, rows);
}

function calcCentralPlateRatio(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number
): number {
  const xStart = Math.round(width * 0.3);
  const xEnd = Math.round(width * 0.7);
  const yStart = Math.round(height * 0.3);
  const yEnd = Math.round(height * 0.7);

  let plateCount = 0;
  let count = 0;

  for (let y = yStart + 1; y < yEnd - 1; y++) {
    for (let x = xStart + 1; x < xEnd - 1; x++) {
      const i = (y * width + x) * channels;
      const l =
        0.2126 * (data[i] ?? 0) +
        0.7152 * (data[i + 1] ?? 0) +
        0.0722 * (data[i + 2] ?? 0);

      const il = (y * width + (x - 1)) * channels;
      const ir = (y * width + (x + 1)) * channels;
      const iu = ((y - 1) * width + x) * channels;
      const id = ((y + 1) * width + x) * channels;

      const ll =
        0.2126 * (data[il] ?? 0) +
        0.7152 * (data[il + 1] ?? 0) +
        0.0722 * (data[il + 2] ?? 0);
      const lr =
        0.2126 * (data[ir] ?? 0) +
        0.7152 * (data[ir + 1] ?? 0) +
        0.0722 * (data[ir + 2] ?? 0);
      const lu =
        0.2126 * (data[iu] ?? 0) +
        0.7152 * (data[iu + 1] ?? 0) +
        0.0722 * (data[iu + 2] ?? 0);
      const ld =
        0.2126 * (data[id] ?? 0) +
        0.7152 * (data[id + 1] ?? 0) +
        0.0722 * (data[id + 2] ?? 0);

      const localMaxDiff = Math.max(
        Math.abs(l - ll),
        Math.abs(l - lr),
        Math.abs(l - lu),
        Math.abs(l - ld)
      );

      if (localMaxDiff < 3 && l > 55 && l < 210) plateCount += 1;
      count += 1;
    }
  }

  return plateCount / Math.max(1, count);
}

/**
 * 上端の構造差
 * 白壁のみだと低くなる
 */
function calcTopContextVariance(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number
): number {
  const xStart = Math.round(width * 0.12);
  const xEnd = Math.round(width * 0.88);
  const yStart = Math.round(height * 0.06);
  const yEnd = Math.round(height * 0.22);

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * width + x) * channels;
      const l =
        0.2126 * (data[i] ?? 0) +
        0.7152 * (data[i + 1] ?? 0) +
        0.0722 * (data[i + 2] ?? 0);
      sum += l;
      sumSq += l * l;
      count += 1;
    }
  }

  const safe = Math.max(1, count);
  const mean = sum / safe;
  const variance = Math.max(0, sumSq / safe - mean * mean);

  return Math.sqrt(variance);
}

/**
 * 左右端の文脈強度
 * ただし強すぎて主役になるのも避けたい
 */
function calcSideContextStrength(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
  side: "left" | "right"
): number {
  const xStart =
    side === "left" ? Math.round(width * 0.02) : Math.round(width * 0.82);
  const xEnd =
    side === "left" ? Math.round(width * 0.18) : Math.round(width * 0.98);
  const yStart = Math.round(height * 0.18);
  const yEnd = Math.round(height * 0.76);

  const structure = calcFlatnessAndEdges(
    data,
    width,
    height,
    channels,
    xStart,
    xEnd,
    yStart,
    yEnd
  );

  const zone = calcZoneStats(data, width, height, channels, xStart, xEnd, yStart, yEnd);

  /**
   * 適度なエッジ + 適度なばらつき + 暗すぎない
   */
  const edgePart = clamp01(structure.edgeDensity / 0.08);
  const variancePart = clamp01(zone.stdDev / 18);
  const brightnessPenalty = zone.mean < 52 ? 0.4 : 1;

  return clamp01((edgePart * 0.55 + variancePart * 0.45) * brightnessPenalty);
}

/**
 * 中央がどれだけ孤立して守られているか
 */
function calcCenterIsolationScore(
  centerBand: ZoneLightStats,
  centerFlatness: number,
  centerEdgeDensity: number
): number {
  const brightness = clamp01((centerBand.mean - 70) / 45);
  const darkPenalty = 1 - clamp01(centerBand.nearBlackPixelRatio / 0.05);
  const edgePenalty = 1 - clamp01(centerEdgeDensity / 0.08);

  /**
   * flatness が高すぎるとベタ板化しやすいので上限補正
   */
  const flatnessPenalty =
    centerFlatness > 0.92 ? 0.25 : centerFlatness > 0.86 ? 0.65 : 1;

  return clamp01(
    (brightness * 0.4 + darkPenalty * 0.35 + edgePenalty * 0.25) * flatnessPenalty
  );
}

/**
 * 下部が本当に床 / テーブル面として続いているか
 */
function calcGroundingContinuityScore(
  lowerBand: ZoneLightStats,
  lowerFlatness: number,
  lowerEdgeDensity: number,
  horizontalBandingRatio: number
): number {
  const brightness = clamp01((lowerBand.mean - 62) / 48);

  /**
   * 面として適度に滑らか、でもベタ過ぎない
   */
  const flatnessPart =
    lowerFlatness < 0.45
      ? clamp01(lowerFlatness / 0.45)
      : lowerFlatness > 0.93
      ? 0.25
      : 1;

  const edgePart = lowerEdgeDensity < 0.003 ? 0.2 : lowerEdgeDensity > 0.12 ? 0.45 : 1;
  const bandPenalty = 1 - clamp01(horizontalBandingRatio / 0.2);
  const darkPenalty = 1 - clamp01(lowerBand.nearBlackPixelRatio / 0.08);

  return clamp01(
    brightness * 0.32 +
      flatnessPart * 0.22 +
      edgePart * 0.16 +
      bandPenalty * 0.18 +
      darkPenalty * 0.12
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function calcContextReadabilityAnalysis(args: {
  data: Uint8Array | Buffer;
  width: number;
  height: number;
  channels: number;
  centerBand: ZoneLightStats;
  lowerBand: ZoneLightStats;
  centerFlatness: number;
  centerEdgeDensity: number;
  lowerFlatness: number;
  lowerEdgeDensity: number;
  horizontalBandingRatio: number;
}): ContextReadabilityAnalysis {
  const {
    data,
    width,
    height,
    channels,
    centerBand,
    lowerBand,
    centerFlatness,
    centerEdgeDensity,
    lowerFlatness,
    lowerEdgeDensity,
    horizontalBandingRatio,
  } = args;

  const topContextVariance = calcTopContextVariance(data, width, height, channels);
  const leftContextStrength = calcSideContextStrength(data, width, height, channels, "left");
  const rightContextStrength = calcSideContextStrength(data, width, height, channels, "right");

  /**
   * 左右どちらか一方だけ極端に強い事故も抑える
   */
  const sideMean = (leftContextStrength + rightContextStrength) / 2;
  const sideGap = Math.abs(leftContextStrength - rightContextStrength);
  const sideContextBalance = clamp01(sideMean * (1 - clamp01(sideGap / 0.75)));

  const centerIsolationScore = calcCenterIsolationScore(
    centerBand,
    centerFlatness,
    centerEdgeDensity
  );

  const groundingContinuityScore = calcGroundingContinuityScore(
    lowerBand,
    lowerFlatness,
    lowerEdgeDensity,
    horizontalBandingRatio
  );

  /**
   * 最終文脈スコア
   * 0〜100点
   */
  const contextReadabilityScore =
    (clamp01(topContextVariance / 16) * 0.24 +
      sideContextBalance * 0.24 +
      centerIsolationScore * 0.28 +
      groundingContinuityScore * 0.24) *
    100;

  return {
    topContextVariance,
    leftContextStrength,
    rightContextStrength,
    sideContextBalance,
    centerIsolationScore,
    groundingContinuityScore,
    contextReadabilityScore,
  };
}

async function analyzeImageVisibility(buf: Buffer): Promise<ImageVisibilityAnalysis> {
  const image = sharp(buf, { failOn: "none" });
  const meta = await image.metadata();

  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = Number(info.width || meta.width || 0);
  const height = Number(info.height || meta.height || 0);
  const channels = Number(info.channels || 3);
  const totalPixels = Math.max(1, width * height);

  let sum = 0;
  let darkCount = 0;
  let nearBlackCount = 0;
  let blownCount = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;

    if (luminance < 58) darkCount += 1;
    if (luminance < 28) nearBlackCount += 1;
    if (luminance > 245) blownCount += 1;
  }

  const stats = await image.removeAlpha().stats();
  const rMean = stats.channels[0]?.mean ?? 0;
  const gMean = stats.channels[1]?.mean ?? 0;
  const bMean = stats.channels[2]?.mean ?? 0;

  const channelStdDevs = stats.channels
    .slice(0, 3)
    .map((c) => Number(c?.stdev ?? 0))
    .filter((v) => Number.isFinite(v));

  const avgStdDev =
    channelStdDevs.length > 0
      ? channelStdDevs.reduce((a, b) => a + b, 0) / channelStdDevs.length
      : 0;

  const centerBand = calcZoneStats(
    data,
    width,
    height,
    channels,
    Math.round(width * 0.22),
    Math.round(width * 0.78),
    Math.round(height * 0.28),
    Math.round(height * 0.72)
  );

  const lowerBand = calcZoneStats(
    data,
    width,
    height,
    channels,
    Math.round(width * 0.18),
    Math.round(width * 0.82),
    Math.round(height * 0.62),
    Math.round(height * 0.92)
  );

  const centerStructure = calcFlatnessAndEdges(
    data,
    width,
    height,
    channels,
    Math.round(width * 0.28),
    Math.round(width * 0.72),
    Math.round(height * 0.3),
    Math.round(height * 0.7)
  );

  const lowerStructure = calcFlatnessAndEdges(
    data,
    width,
    height,
    channels,
    Math.round(width * 0.14),
    Math.round(width * 0.86),
    Math.round(height * 0.68),
    Math.round(height * 0.9)
  );

  const borderGlowRatio = calcBorderGlowRatio(data, width, height, channels);
  const isolatedNoiseRatio = calcIsolatedNoiseRatio(data, width, height, channels);
  const horizontalBandingRatio = calcHorizontalBandingRatio(data, width, height, channels);
  const centralPlateRatio = calcCentralPlateRatio(data, width, height, channels);

  const context = calcContextReadabilityAnalysis({
    data,
    width,
    height,
    channels,
    centerBand,
    lowerBand,
    centerFlatness: centerStructure.flatness,
    centerEdgeDensity: centerStructure.edgeDensity,
    lowerFlatness: lowerStructure.flatness,
    lowerEdgeDensity: lowerStructure.edgeDensity,
    horizontalBandingRatio,
  });

  return {
    width,
    height,
    mean: sum / totalPixels,
    minChannelMean: Math.min(rMean, gMean, bMean),
    darkPixelRatio: darkCount / totalPixels,
    nearBlackPixelRatio: nearBlackCount / totalPixels,
    blownPixelRatio: blownCount / totalPixels,
    avgStdDev,
    centerBand,
    lowerBand,
    centerFlatness: centerStructure.flatness,
    lowerFlatness: lowerStructure.flatness,
    centerEdgeDensity: centerStructure.edgeDensity,
    lowerEdgeDensity: lowerStructure.edgeDensity,
    borderGlowRatio,
    isolatedNoiseRatio,
    horizontalBandingRatio,
    centralPlateRatio,
    context,
  };
}

function shouldApplyVisibilityLift(a: ImageVisibilityAnalysis): boolean {
  return (
    a.mean < 92 ||
    a.minChannelMean < 72 ||
    a.centerBand.mean < 84 ||
    a.lowerBand.mean < 76 ||
    a.centerBand.nearBlackPixelRatio > 0.02 ||
    a.lowerBand.nearBlackPixelRatio > 0.03 ||
    a.nearBlackPixelRatio > 0.05
  );
}

function isTemplateLike(a: ImageVisibilityAnalysis): boolean {
  const hasReadableWorldContext =
    a.context.topContextVariance > 9 ||
    a.context.leftContextStrength > 0.35 ||
    a.context.rightContextStrength > 0.35 ||
    a.context.sideContextBalance > 0.28;

  return (
    !hasReadableWorldContext &&
    a.avgStdDev < 7 &&
    a.centerBand.stdDev < 5 &&
    a.lowerBand.stdDev < 5 &&
    a.mean > 85 &&
    a.mean < 180
  );
}

function isStructurallyBroken(a: ImageVisibilityAnalysis): boolean {
  return (
    (a.centralPlateRatio > 0.78 && a.centerFlatness > 0.83) ||
    (a.centralPlateRatio > 0.72 && a.centerFlatness > 0.86) ||
    (a.borderGlowRatio > 0.18 && a.isolatedNoiseRatio > 0.015) ||
    (a.horizontalBandingRatio > 0.22 && a.lowerEdgeDensity < 0.02) ||
    (a.centerFlatness > 0.9 && a.centerEdgeDensity < 0.01 && a.centerBand.stdDev < 6) ||
    (a.isolatedNoiseRatio > 0.03 && a.avgStdDev > 22) ||
    (a.lowerFlatness > 0.9 && a.lowerEdgeDensity < 0.008 && a.lowerBand.stdDev < 5)
  );
}

/**
 * 文脈不足は補正で救済しない
 * ここが v23 の方針
 */
function isContextuallyWeak(a: ImageVisibilityAnalysis): boolean {
  return a.context.contextReadabilityScore < MIN_CONTEXT_READABILITY_SCORE;
}

function isUnacceptablyInvisible(a: ImageVisibilityAnalysis): boolean {
  return (
    a.mean < 52 ||
    a.minChannelMean < 40 ||
    a.centerBand.mean < 52 ||
    a.lowerBand.mean < 48 ||
    a.nearBlackPixelRatio > 0.12 ||
    a.centerBand.nearBlackPixelRatio > 0.05 ||
    a.lowerBand.nearBlackPixelRatio > 0.08 ||
    (a.centerBand.stdDev < 4 && a.centerBand.mean < 70) ||
    isTemplateLike(a) ||
    isStructurallyBroken(a)
  );
}

function makeSoftRectOverlaySvg(
  width: number,
  height: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  opacity: number,
  blur: number,
  rx: number
): Buffer {
  const safeOpacity = Math.max(0, Math.min(1, opacity));
  const safeBlur = Math.max(0, blur);
  const safeRx = Math.max(0, rx);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="blur">
        <feGaussianBlur stdDeviation="${safeBlur}" />
      </filter>
    </defs>
    <rect
      x="${x}"
      y="${y}"
      width="${rectWidth}"
      height="${rectHeight}"
      rx="${safeRx}"
      ry="${safeRx}"
      fill="white"
      fill-opacity="${safeOpacity}"
      filter="url(#blur)"
    />
  </svg>
  `;
  return Buffer.from(svg);
}

function makeLinearGradientOverlaySvg(args: {
  width: number;
  height: number;
  x: number;
  y: number;
  rectWidth: number;
  rectHeight: number;
  startOpacity: number;
  endOpacity: number;
  direction: "vertical" | "horizontal";
  blur: number;
  rx: number;
}): Buffer {
  const {
    width,
    height,
    x,
    y,
    rectWidth,
    rectHeight,
    startOpacity,
    endOpacity,
    direction,
    blur,
    rx,
  } = args;

  const gradientAttrs =
    direction === "vertical"
      ? `x1="0%" y1="0%" x2="0%" y2="100%"`
      : `x1="0%" y1="0%" x2="100%" y2="0%"`;

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" ${gradientAttrs}>
        <stop offset="0%" stop-color="white" stop-opacity="${Math.max(0, Math.min(1, startOpacity))}" />
        <stop offset="100%" stop-color="white" stop-opacity="${Math.max(0, Math.min(1, endOpacity))}" />
      </linearGradient>
      <filter id="blur">
        <feGaussianBlur stdDeviation="${Math.max(0, blur)}" />
      </filter>
    </defs>
    <rect
      x="${x}"
      y="${y}"
      width="${rectWidth}"
      height="${rectHeight}"
      rx="${Math.max(0, rx)}"
      ry="${Math.max(0, rx)}"
      fill="url(#grad)"
      filter="url(#blur)"
    />
  </svg>
  `;
  return Buffer.from(svg);
}

async function applyCenterRescue(
  buf: Buffer,
  strength: 1 | 2 | 3
): Promise<Buffer> {
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  const width = Number(meta.width || 1024);
  const height = Number(meta.height || 1024);

  const centerRect = {
    x: Math.round(width * 0.25),
    y: Math.round(height * 0.26),
    w: Math.round(width * 0.5),
    h: Math.round(height * 0.42),
  };

  const lowerRect = {
    x: Math.round(width * 0.2),
    y: Math.round(height * 0.62),
    w: Math.round(width * 0.6),
    h: Math.round(height * 0.22),
  };

  const centerOpacity = strength === 1 ? 0.14 : strength === 2 ? 0.22 : 0.3;
  const lowerOpacity = strength === 1 ? 0.1 : strength === 2 ? 0.15 : 0.2;
  const blur = strength === 1 ? 24 : strength === 2 ? 34 : 44;
  const sharpenSigma = strength === 1 ? 0.8 : strength === 2 ? 0.95 : 1.1;

  return await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .composite([
      {
        input: makeSoftRectOverlaySvg(
          width,
          height,
          centerRect.x,
          centerRect.y,
          centerRect.w,
          centerRect.h,
          centerOpacity,
          blur,
          Math.round(width * 0.04)
        ),
        blend: "screen",
      },
      {
        input: makeSoftRectOverlaySvg(
          width,
          height,
          lowerRect.x,
          lowerRect.y,
          lowerRect.w,
          lowerRect.h,
          lowerOpacity,
          blur,
          Math.round(width * 0.03)
        ),
        blend: "screen",
      },
    ])
    .modulate({
      brightness: strength === 1 ? 1.04 : strength === 2 ? 1.07 : 1.1,
      saturation: 0.99,
    })
    .gamma(strength === 1 ? 1.08 : strength === 2 ? 1.13 : 1.18)
    .sharpen(sharpenSigma)
    .png()
    .toBuffer();
}

async function applyVisibilityLift(
  buf: Buffer,
  strength: 1 | 2 | 3
): Promise<Buffer> {
  const brightness = strength === 1 ? 1.12 : strength === 2 ? 1.2 : 1.28;
  const gamma = strength === 1 ? 1.12 : strength === 2 ? 1.22 : 1.32;
  const gain = strength === 1 ? 1.02 : strength === 2 ? 1.04 : 1.06;
  const offset = strength === 1 ? 8 : strength === 2 ? 14 : 20;
  const sharpenSigma = strength === 1 ? 0.75 : strength === 2 ? 0.9 : 1.0;

  return await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .gamma(gamma)
    .modulate({
      brightness,
      saturation: 0.98,
    })
    .linear(gain, offset)
    .sharpen(sharpenSigma)
    .png()
    .toBuffer();
}

async function applyStructureScaffold(
  buf: Buffer,
  groundingType: GroundingType,
  strength: 1 | 2 | 3
): Promise<Buffer> {
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  const width = Number(meta.width || 1024);
  const height = Number(meta.height || 1024);

  const centerX = Math.round(width * 0.22);
  const centerY = Math.round(height * 0.22);
  const centerW = Math.round(width * 0.56);
  const centerH = Math.round(height * 0.46);

  const wallStart = strength === 1 ? 0.08 : strength === 2 ? 0.12 : 0.16;
  const wallEnd = strength === 1 ? 0.02 : strength === 2 ? 0.04 : 0.06;

  const planeStart = strength === 1 ? 0.1 : strength === 2 ? 0.14 : 0.18;
  const planeEnd = strength === 1 ? 0.18 : strength === 2 ? 0.24 : 0.3;

  const blur = strength === 1 ? 18 : strength === 2 ? 24 : 30;

  const composites: sharp.OverlayOptions[] = [
    {
      input: makeLinearGradientOverlaySvg({
        width,
        height,
        x: centerX,
        y: centerY,
        rectWidth: centerW,
        rectHeight: centerH,
        startOpacity: wallStart,
        endOpacity: wallEnd,
        direction: "vertical",
        blur,
        rx: Math.round(width * 0.035),
      }),
      blend: "screen",
    },
  ];

  if (
    groundingType === "floor" ||
    groundingType === "table" ||
    groundingType === "shelf" ||
    groundingType === "display"
  ) {
    composites.push({
      input: makeLinearGradientOverlaySvg({
        width,
        height,
        x:
          groundingType === "shelf" || groundingType === "display"
            ? Math.round(width * 0.2)
            : Math.round(width * 0.12),
        y:
          groundingType === "table"
            ? Math.round(height * 0.66)
            : groundingType === "shelf"
            ? Math.round(height * 0.68)
            : groundingType === "display"
            ? Math.round(height * 0.7)
            : Math.round(height * 0.62),
        rectWidth:
          groundingType === "shelf" || groundingType === "display"
            ? Math.round(width * 0.6)
            : Math.round(width * 0.76),
        rectHeight:
          groundingType === "table"
            ? Math.round(height * 0.2)
            : groundingType === "shelf"
            ? Math.round(height * 0.14)
            : groundingType === "display"
            ? Math.round(height * 0.12)
            : Math.round(height * 0.26),
        startOpacity: planeStart,
        endOpacity: planeEnd,
        direction: "vertical",
        blur,
        rx: Math.round(width * 0.028),
      }),
      blend: "screen",
    });
  }

  if (groundingType === "wall" || groundingType === "hanging") {
    composites.push({
      input: makeSoftRectOverlaySvg(
        width,
        height,
        Math.round(width * 0.2),
        Math.round(height * 0.28),
        Math.round(width * 0.6),
        Math.round(height * 0.4),
        strength === 1 ? 0.08 : strength === 2 ? 0.12 : 0.16,
        blur,
        Math.round(width * 0.04)
      ),
      blend: "screen",
    });
  }

  return await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .composite(composites)
    .modulate({
      brightness: strength === 1 ? 1.03 : strength === 2 ? 1.06 : 1.09,
      saturation: 0.99,
    })
    .gamma(strength === 1 ? 1.04 : strength === 2 ? 1.08 : 1.12)
    .sharpen(strength === 1 ? 0.75 : strength === 2 ? 0.9 : 1.0)
    .png()
    .toBuffer();
}

/**
 * 文脈不足は補正で救済しない。
 * 可視性・構造破綻だけ補正する。
 */
async function ensureAcceptableBackground(
  buf: Buffer,
  groundingType: GroundingType
): Promise<{
  buffer: Buffer;
  before: ImageVisibilityAnalysis;
  after: ImageVisibilityAnalysis;
}> {
  const before = await analyzeImageVisibility(buf);

  /**
   * 文脈が弱いならここで即失敗
   * 明るくしても「白壁だけ」は治らないため
   */
  if (isContextuallyWeak(before)) {
    throw new Error(
      `context readability failed before rescue (score=${before.context.contextReadabilityScore.toFixed(
        1
      )}, topVariance=${before.context.topContextVariance.toFixed(
        2
      )}, left=${before.context.leftContextStrength.toFixed(
        3
      )}, right=${before.context.rightContextStrength.toFixed(
        3
      )}, sideBalance=${before.context.sideContextBalance.toFixed(
        3
      )}, centerIsolation=${before.context.centerIsolationScore.toFixed(
        3
      )}, groundingContinuity=${before.context.groundingContinuityScore.toFixed(3)})`
    );
  }

  let out = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .sharpen(0.75)
    .png()
    .toBuffer();

  let current = await analyzeImageVisibility(out);

  if (shouldApplyVisibilityLift(current)) {
    out = await applyVisibilityLift(out, 1);
    current = await analyzeImageVisibility(out);
  }

  if (current.centerBand.mean < 78 || current.centerBand.stdDev < 5.5) {
    out = await applyCenterRescue(out, 1);
    current = await analyzeImageVisibility(out);
  }

  if (current.centralPlateRatio > 0.68 || current.centerFlatness > 0.84) {
    out = await applyStructureScaffold(out, groundingType, 1);
    current = await analyzeImageVisibility(out);
  }

  if (shouldApplyVisibilityLift(current)) {
    out = await applyVisibilityLift(out, 2);
    current = await analyzeImageVisibility(out);
  }

  if (
    current.centerBand.mean < 84 ||
    current.lowerBand.mean < 72 ||
    current.centerBand.stdDev < 6.5
  ) {
    out = await applyCenterRescue(out, 2);
    current = await analyzeImageVisibility(out);
  }

  if (
    current.centralPlateRatio > 0.72 ||
    current.centerFlatness > 0.86 ||
    current.horizontalBandingRatio > 0.18
  ) {
    out = await applyStructureScaffold(out, groundingType, 2);
    current = await analyzeImageVisibility(out);
  }

  if (shouldApplyVisibilityLift(current)) {
    out = await applyVisibilityLift(out, 3);
    current = await analyzeImageVisibility(out);
  }

  if (
    current.centerBand.mean < 90 ||
    current.lowerBand.mean < 76 ||
    current.centerBand.stdDev < 7.5
  ) {
    out = await applyCenterRescue(out, 3);
    current = await analyzeImageVisibility(out);
  }

  if (
    current.mean < 70 ||
    current.centerBand.mean < 72 ||
    current.lowerBand.mean < 66
  ) {
    out = await applyVisibilityLift(out, 3);
    current = await analyzeImageVisibility(out);
  }

  if (
    current.centralPlateRatio > 0.7 ||
    current.centerFlatness > 0.82 ||
    current.lowerFlatness > 0.88 ||
    current.horizontalBandingRatio > 0.16
  ) {
    out = await applyStructureScaffold(out, groundingType, 3);
    current = await analyzeImageVisibility(out);
  }

  /**
   * 補正後も文脈が弱いなら不採用
   */
  if (isContextuallyWeak(current)) {
    throw new Error(
      `context readability failed after rescue (score=${current.context.contextReadabilityScore.toFixed(
        1
      )}, topVariance=${current.context.topContextVariance.toFixed(
        2
      )}, left=${current.context.leftContextStrength.toFixed(
        3
      )}, right=${current.context.rightContextStrength.toFixed(
        3
      )}, sideBalance=${current.context.sideContextBalance.toFixed(
        3
      )}, centerIsolation=${current.context.centerIsolationScore.toFixed(
        3
      )}, groundingContinuity=${current.context.groundingContinuityScore.toFixed(3)})`
    );
  }

  if (isUnacceptablyInvisible(current)) {
    throw new Error(
      `generated background visibility failed (mean=${current.mean.toFixed(
        1
      )}, centerMean=${current.centerBand.mean.toFixed(
        1
      )}, lowerMean=${current.lowerBand.mean.toFixed(
        1
      )}, nearBlack=${current.nearBlackPixelRatio.toFixed(
        3
      )}, centerNearBlack=${current.centerBand.nearBlackPixelRatio.toFixed(
        3
      )}, lowerNearBlack=${current.lowerBand.nearBlackPixelRatio.toFixed(
        3
      )}, avgStdDev=${current.avgStdDev.toFixed(
        1
      )}, centerStdDev=${current.centerBand.stdDev.toFixed(
        1
      )}, lowerStdDev=${current.lowerBand.stdDev.toFixed(
        1
      )}, centerFlatness=${current.centerFlatness.toFixed(
        3
      )}, lowerFlatness=${current.lowerFlatness.toFixed(
        3
      )}, centerEdgeDensity=${current.centerEdgeDensity.toFixed(
        3
      )}, lowerEdgeDensity=${current.lowerEdgeDensity.toFixed(
        3
      )}, borderGlowRatio=${current.borderGlowRatio.toFixed(
        3
      )}, isolatedNoiseRatio=${current.isolatedNoiseRatio.toFixed(
        3
      )}, horizontalBandingRatio=${current.horizontalBandingRatio.toFixed(
        3
      )}, centralPlateRatio=${current.centralPlateRatio.toFixed(
        3
      )}, contextScore=${current.context.contextReadabilityScore.toFixed(1)})`
    );
  }

  return {
    buffer: out,
    before,
    after: current,
  };
}

async function generateOpenAiBackground(prompt: string, apiKey: string): Promise<Buffer> {
  const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    }),
  });

  const openaiJson = await openaiRes.json().catch(() => ({} as any));
  if (!openaiRes.ok) {
    throw new Error(openaiJson?.error?.message || "openai image generation error");
  }

  const b64 = openaiJson?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || !b64) {
    throw new Error("no image returned");
  }

  return Buffer.from(b64, "base64");
}

function buildAttemptMergedRules(args: {
  scene: BgScene;
  productCategory: ProductCategory;
  productSize: ProductSize;
  groundingType: GroundingType;
  sellDirection: SellDirection;
  backgroundWorldStyle: BackgroundWorldStyle;
  keyword: string;
  brandRules: string[];
  hardConstraints: string[];
  attempt: number;
}) {
  const {
    scene,
    productCategory,
    productSize,
    groundingType,
    sellDirection,
    backgroundWorldStyle,
    keyword,
    brandRules,
    hardConstraints,
    attempt,
  } = args;

return [
  ...buildBaseHardRules(),
  ...buildSceneRules(scene),
  ...buildCategoryRules(productCategory),
  ...buildGroundingRules(groundingType),
  ...buildSizeRules(productSize),
  ...buildSellDirectionRules(sellDirection),
  ...buildBackgroundWorldStyleRules(
    backgroundWorldStyle,
    classifyKeywordScenario(keyword)
  ),
  ...buildDesignedWhitespaceRules(backgroundWorldStyle),
  ...buildKeywordAssistRules(keyword),
  ...buildEdgePlacementRules(scene, groundingType),
  ...buildRealisticObjectPlacementRules(classifyKeywordScenario(keyword)),
  ...buildAttemptOverrideRules(attempt, groundingType),
  ...brandRules,
  ...hardConstraints,
].filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0);
}


/**
 * AIRA構図違反スコア
 * 0〜1（1が良い）
 */
function calcAiraStructureScore(a: ImageVisibilityAnalysis): number {
  // 中央侵入（エッジ多い＝何かある）
  const centerViolation = clamp01(a.centerEdgeDensity / 0.08);

  // ベタ板（フラットすぎ）
  const platePenalty =
    a.centerFlatness > 0.85 && a.centralPlateRatio > 0.65 ? 1 : 0;

  // 支持面不安定（下部エッジ少なすぎ or 多すぎ）
  const groundingBad =
    a.lowerEdgeDensity < 0.005 || a.lowerEdgeDensity > 0.12 ? 1 : 0;

  // 最終
  const score =
    1 -
    (centerViolation * 0.5 +
      platePenalty * 0.3 +
      groundingBad * 0.2);

  return clamp01(score);
}

/**
 * 総合採用スコア
 * 候補2枚の比較選抜に使う
 */
function calcAcceptScore(a: ImageVisibilityAnalysis): number {
  const brightnessScore = clamp01((a.mean - 60) / 55) * 100;
  const centerScore = clamp01((a.centerBand.mean - 72) / 35) * 100;
  const lowerScore = clamp01((a.lowerBand.mean - 64) / 35) * 100;
  const darkPenalty = (1 - clamp01(a.nearBlackPixelRatio / 0.12)) * 100;
  const structurePenalty =
    (1 -
      clamp01(
        (a.centralPlateRatio * 0.4 +
          a.horizontalBandingRatio * 0.25 +
          a.borderGlowRatio * 0.2 +
          a.isolatedNoiseRatio * 5 * 0.15)
      )) *
    100;

const airaStructureScore = calcAiraStructureScore(a) * 100;

const worldContextScore =
  clamp01(a.context.topContextVariance / 18) * 40 +
  clamp01(a.context.sideContextBalance / 0.5) * 40 +
  clamp01((a.avgStdDev - 6) / 16) * 20;

return (
  brightnessScore * 0.08 +
  centerScore * 0.12 +
  lowerScore * 0.09 +
  darkPenalty * 0.09 +
  structurePenalty * 0.14 +
  a.context.contextReadabilityScore * 0.22 +
  airaStructureScore * 0.13 +
  worldContextScore * 0.13
);
}

export async function POST(req: Request) {
  let logUid = "unknown";
  let logDraftId = "unknown";
  let logKeyword = "unknown";
  let logScene: BgScene | "unknown" = "unknown";
  let logGroundingType: GroundingType | "unknown" = "unknown";
  let logProductCategory: ProductCategory | "unknown" = "unknown";

  try {
    const user = await requireUserFromAuthHeader(req);
    const uid = user.uid;
    logUid = uid;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const draftId = String(body.draftId ?? "").trim();
    const brandId = String(body.brandId ?? "vento").trim();
    const vision = String(body.vision ?? "").trim();
    const keywords = compactKeywords(body.keywords);
    const rawKeyword = normalizeKeyword(body.keyword);

    const rawScene = normalizeScene(body.scene);
    const rawProductCategory = normalizeProductCategory(body.productCategory);
    const rawProductSize = normalizeProductSize(body.productSize);
    const rawGroundingType = normalizeGroundingType(body.groundingType);
    const rawSellDirection = normalizeSellDirection(body.sellDirection);
    const rawBackgroundWorldStyle = normalizeBackgroundWorldStyle(
      body.backgroundWorldStyle
    );

    logDraftId = draftId || "unknown";
    logKeyword = rawKeyword || "unknown";
    logScene = rawScene;
    logGroundingType = rawGroundingType;
    logProductCategory = rawProductCategory;

    const hardConstraints = compactConstraints(body.hardConstraints);
    const referenceImageUrl = validateReferenceImageUrl(body.referenceImageUrl);

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "draftId is required" },
        { status: 400 }
      );
    }

    if (!vision) {
      return NextResponse.json(
        { ok: false, error: "vision is required" },
        { status: 400 }
      );
    }

    if (!rawKeyword) {
      return NextResponse.json(
        { ok: false, error: "keyword is required" },
        { status: 400 }
      );
    }

    const brand = await loadBrand(uid, brandId);
    if (!brand) {
      return NextResponse.json(
        { ok: false, error: "brand not found" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const draftSnap = await db.collection("drafts").doc(draftId).get();

    if (!draftSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "draft not found" },
        { status: 404 }
      );
    }

    const draftData = draftSnap.data() || {};
    if (String(draftData.userId || "") !== uid) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

const resolved = resolveGenerationContext({
  scene: rawScene,
  productCategory: rawProductCategory,
  productSize: rawProductSize,
  groundingType: rawGroundingType,
  sellDirection: rawSellDirection,
  backgroundWorldStyle: rawBackgroundWorldStyle,
  keyword: rawKeyword,
}); // ← ★これを追加

const scene = resolved.scene;
const productCategory = resolved.productCategory;
const productSize = resolved.productSize;
const groundingType = resolved.groundingType;
const sellDirection = resolved.sellDirection;
const backgroundWorldStyle = resolved.backgroundWorldStyle;
const keyword = resolved.keyword;
const keywordScenario = resolved.keywordScenario;

    logKeyword = keyword || "unknown";
    logScene = scene;
    logGroundingType = groundingType;
    logProductCategory = productCategory;

    const blueprint = buildStructureBlueprint(
      keywordScenario,
      scene,
      groundingType,
      productCategory
    );

    const styleText = String(brand.styleText ?? "").trim();
    const brandRules = readBrandTextArray(brand.rules);

    const cacheIdentity = {
      uid,
      draftId,
      brandId,
      vision,
      keywords,
      keyword,
      keywordScenario,
      scene,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      backgroundWorldStyle,
      blueprint,
      styleText,
      brandRules,
      hardConstraints,
type: "bg_usage_context_v27_front_facing_study_tabletop_composition",
      size: "1024x1024",
      version: AI_BG_VERSION,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
    };

    const hash = stableHash(cacheIdentity);

    const bucket = getStorage().bucket();
    const objectPath = `users/${uid}/drafts/${draftId}/bg/${hash}.png`;
    const fileRef = bucket.file(objectPath);

    const [exists] = await fileRef.exists();
    if (exists) {
      const [meta] = await fileRef.getMetadata().catch(() => [null as any]);

      const existingToken =
        meta?.metadata?.firebaseStorageDownloadTokens ||
        meta?.metadata?.firebaseStorageDownloadToken ||
        "";

      const token =
        typeof existingToken === "string" && existingToken.trim()
          ? existingToken.split(",")[0].trim()
          : crypto.randomUUID();

      if (!existingToken) {
        await fileRef.setMetadata({
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
          contentType: meta?.contentType || "image/png",
        });
      }

      return NextResponse.json({
        ok: true,
        url: buildDownloadUrl(bucket.name, objectPath, token),
        reused: true,
        draftId,
        scene,
        keyword,
        productCategory,
        productSize,
        groundingType,
        sellDirection,
        meta: {
          purpose: "ai_background",
          version: AI_BG_VERSION,
          keywordScenario,
          referenceImageAccepted: !!referenceImageUrl,
          referenceImageUsedForGeneration: false,
          generationAttempt: 0,
          backgroundWorldStyle,
        },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    /**
     * v23では「失敗したら次」ではなく、
     * 最大2候補を作って比較し、最良を採用する
     */
    const candidates: CandidateResult[] = [];
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const mergedRules = buildAttemptMergedRules({
          scene,
          productCategory,
          productSize,
          groundingType,
          sellDirection,
          backgroundWorldStyle,
          keyword,
          brandRules,
          hardConstraints,
          attempt,
        });

        const prompt = buildPrompt({
          brandId,
          brandName: String((brand as any).displayName || brandId),
          vision,
          keywords,
          keyword,
          scene,
          productCategory,
          productSize,
          groundingType,
          sellDirection,
          backgroundWorldStyle,
          styleText,
          mergedRules,
          blueprint,
          attempt,
        });

        const rawBuf = await generateOpenAiBackground(prompt, apiKey);
        const ensured = await ensureAcceptableBackground(rawBuf, groundingType);
        const acceptScore = calcAcceptScore(ensured.after);

        if (acceptScore >= MIN_TOTAL_ACCEPT_SCORE) {
          candidates.push({
            ...ensured,
            attempt,
            prompt,
            acceptScore,
          });
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (candidates.length === 0) {
      throw lastError instanceof Error ? lastError : new Error("generate bg failed");
    }

    /**
     * 2候補から最良を採用
     */
    const ensuredResult = candidates.sort((a, b) => b.acceptScore - a.acceptScore)[0];

    const token = crypto.randomUUID();

    await fileRef.save(ensuredResult.buffer, {
      contentType: "image/png",
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          aiBackgroundVersion: AI_BG_VERSION,
          keywordScenario,
          referenceImageAccepted: String(!!referenceImageUrl),
          referenceImageUsedForGeneration: "false",
          generationAttempt: String(ensuredResult.attempt),
          acceptScore: ensuredResult.acceptScore.toFixed(2),

          meanBefore: ensuredResult.before.mean.toFixed(2),
          meanAfter: ensuredResult.after.mean.toFixed(2),

          minChannelMeanBefore: ensuredResult.before.minChannelMean.toFixed(2),
          minChannelMeanAfter: ensuredResult.after.minChannelMean.toFixed(2),

          darkPixelRatioBefore: ensuredResult.before.darkPixelRatio.toFixed(4),
          darkPixelRatioAfter: ensuredResult.after.darkPixelRatio.toFixed(4),

          nearBlackPixelRatioBefore: ensuredResult.before.nearBlackPixelRatio.toFixed(4),
          nearBlackPixelRatioAfter: ensuredResult.after.nearBlackPixelRatio.toFixed(4),

          blownPixelRatioBefore: ensuredResult.before.blownPixelRatio.toFixed(4),
          blownPixelRatioAfter: ensuredResult.after.blownPixelRatio.toFixed(4),

          avgStdDevBefore: ensuredResult.before.avgStdDev.toFixed(2),
          avgStdDevAfter: ensuredResult.after.avgStdDev.toFixed(2),

          centerMeanBefore: ensuredResult.before.centerBand.mean.toFixed(2),
          centerMeanAfter: ensuredResult.after.centerBand.mean.toFixed(2),

          lowerMeanBefore: ensuredResult.before.lowerBand.mean.toFixed(2),
          lowerMeanAfter: ensuredResult.after.lowerBand.mean.toFixed(2),

          centerStdDevBefore: ensuredResult.before.centerBand.stdDev.toFixed(2),
          centerStdDevAfter: ensuredResult.after.centerBand.stdDev.toFixed(2),

          lowerStdDevBefore: ensuredResult.before.lowerBand.stdDev.toFixed(2),
          lowerStdDevAfter: ensuredResult.after.lowerBand.stdDev.toFixed(2),

          centerNearBlackBefore:
            ensuredResult.before.centerBand.nearBlackPixelRatio.toFixed(4),
          centerNearBlackAfter:
            ensuredResult.after.centerBand.nearBlackPixelRatio.toFixed(4),

          lowerNearBlackBefore:
            ensuredResult.before.lowerBand.nearBlackPixelRatio.toFixed(4),
          lowerNearBlackAfter:
            ensuredResult.after.lowerBand.nearBlackPixelRatio.toFixed(4),

          centerFlatnessBefore: ensuredResult.before.centerFlatness.toFixed(4),
          centerFlatnessAfter: ensuredResult.after.centerFlatness.toFixed(4),

          lowerFlatnessBefore: ensuredResult.before.lowerFlatness.toFixed(4),
          lowerFlatnessAfter: ensuredResult.after.lowerFlatness.toFixed(4),

          centerEdgeDensityBefore: ensuredResult.before.centerEdgeDensity.toFixed(4),
          centerEdgeDensityAfter: ensuredResult.after.centerEdgeDensity.toFixed(4),

          lowerEdgeDensityBefore: ensuredResult.before.lowerEdgeDensity.toFixed(4),
          lowerEdgeDensityAfter: ensuredResult.after.lowerEdgeDensity.toFixed(4),

          borderGlowRatioBefore: ensuredResult.before.borderGlowRatio.toFixed(4),
          borderGlowRatioAfter: ensuredResult.after.borderGlowRatio.toFixed(4),

          isolatedNoiseRatioBefore: ensuredResult.before.isolatedNoiseRatio.toFixed(4),
          isolatedNoiseRatioAfter: ensuredResult.after.isolatedNoiseRatio.toFixed(4),

          horizontalBandingRatioBefore:
            ensuredResult.before.horizontalBandingRatio.toFixed(4),
          horizontalBandingRatioAfter:
            ensuredResult.after.horizontalBandingRatio.toFixed(4),

          centralPlateRatioBefore: ensuredResult.before.centralPlateRatio.toFixed(4),
          centralPlateRatioAfter: ensuredResult.after.centralPlateRatio.toFixed(4),

          topContextVarianceBefore:
            ensuredResult.before.context.topContextVariance.toFixed(4),
          topContextVarianceAfter:
            ensuredResult.after.context.topContextVariance.toFixed(4),

          leftContextStrengthBefore:
            ensuredResult.before.context.leftContextStrength.toFixed(4),
          leftContextStrengthAfter:
            ensuredResult.after.context.leftContextStrength.toFixed(4),

          rightContextStrengthBefore:
            ensuredResult.before.context.rightContextStrength.toFixed(4),
          rightContextStrengthAfter:
            ensuredResult.after.context.rightContextStrength.toFixed(4),

          sideContextBalanceBefore:
            ensuredResult.before.context.sideContextBalance.toFixed(4),
          sideContextBalanceAfter:
            ensuredResult.after.context.sideContextBalance.toFixed(4),

          centerIsolationScoreBefore:
            ensuredResult.before.context.centerIsolationScore.toFixed(4),
          centerIsolationScoreAfter:
            ensuredResult.after.context.centerIsolationScore.toFixed(4),

          groundingContinuityScoreBefore:
            ensuredResult.before.context.groundingContinuityScore.toFixed(4),
          groundingContinuityScoreAfter:
            ensuredResult.after.context.groundingContinuityScore.toFixed(4),

          contextReadabilityScoreBefore:
            ensuredResult.before.context.contextReadabilityScore.toFixed(2),
          contextReadabilityScoreAfter:
            ensuredResult.after.context.contextReadabilityScore.toFixed(2),
        },
      },
    });
    try {
      await saveBgLog({
        uid,
        draftId,
        imageUrl: buildDownloadUrl(bucket.name, objectPath, token),

        keyword,
        scene,
        groundingType,
        productCategory,

        attempt: ensuredResult.attempt,

        visibilityScore: ensuredResult.after.mean,
        contextScore: ensuredResult.after.context.contextReadabilityScore,
        acceptScore: ensuredResult.acceptScore,

        isAccepted: true,
      });
    } catch (logError) {
      console.error("[saveBgLog][success] error:", logError);
    }

    return NextResponse.json({
      ok: true,
      url: buildDownloadUrl(bucket.name, objectPath, token),
      reused: false,
      draftId,
      scene,
      keyword,
      keywordScenario,
      productCategory,
      productSize,
      groundingType,
      sellDirection,
      meta: {
        purpose: "ai_background",
        version: AI_BG_VERSION,
        referenceImageAccepted: !!referenceImageUrl,
        referenceImageUsedForGeneration: false,
        generationAttempt: ensuredResult.attempt,
        backgroundWorldStyle,
        acceptScore: ensuredResult.acceptScore,
        visibilityBefore: ensuredResult.before,
        visibilityAfter: ensuredResult.after,
      },
    });
  } catch (e: any) {
    try {
      await saveBgLog({
        uid: logUid,
        draftId: logDraftId,

        keyword: logKeyword,
        scene: logScene,
        groundingType: logGroundingType,
        productCategory: logProductCategory,

        attempt: 0,

        visibilityScore: 0,
        contextScore: 0,
        acceptScore: 0,

        isAccepted: false,
        failureReason: e?.message || "unknown error",
      });
    } catch (logError) {
      console.error("[saveBgLog][failure] error:", logError);
    }

    console.error("[generate-bg] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "generate bg failed" },
      { status: 500 }
    );
    
  }
}
