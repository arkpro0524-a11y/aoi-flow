// /lib/videoDecision/labels.ts

export type VideoLabels = {
  motion: "static" | "dynamic";
  emphasis: "restrained" | "strong";
  focus: "world" | "product";
  emotion: "low" | "mid" | "high";
};