// /app/layout.tsx
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  title: "AOI FLOW",
  applicationName: "AOI FLOW",
  themeColor: "#0A1020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* ✅ viewport をここで固定（どこかのページで崩しても戻る） */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body>
        {/* 背景ビネット */}
        <div id="_vignette" />

        {/* ✅ UI本体：ここだけが前面。transform/zoom事故を受けにくい */}
        <div id="_appRoot">
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </div>
      </body>
    </html>
  );
}