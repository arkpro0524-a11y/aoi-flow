// app/icon.tsx
// ✅ 画像ファイルを置かずに PWA アイコンを生成（再構築性）
import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "512px",
          height: "512px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A1020",
          color: "white",
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        AOI
      </div>
    ),
    size
  );
}