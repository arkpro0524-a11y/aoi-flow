// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AOI FLOW – Caption Studio",
    short_name: "AOI FLOW",
    description: "考える → 書く → 投稿する → 溜まる をFLOWで固定化する",
    start_url: "/flow",
    display: "standalone",
    background_color: "#0A1020",
    theme_color: "#0A1020",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
    ],
  };
}