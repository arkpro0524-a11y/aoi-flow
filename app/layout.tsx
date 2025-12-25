// /app/layout.tsx
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";

// ✅ スマホが“勝手に拡大”しないための必須設定
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}