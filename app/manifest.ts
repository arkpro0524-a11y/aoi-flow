import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AOI FLOW – Caption Studio",
    short_name: "AOI FLOW",
    description: "考える → 書く → 投稿する → 溜まる をFLOWで固定化する",
    start_url: "/flow",
    scope: "/",
    display: "standalone",
    background_color: "#0A1020",
    theme_color: "#0A1020",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}