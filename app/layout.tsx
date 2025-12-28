// /app/layout.tsx
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import AuthGate from "@/components/AuthGate";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata = {
  title: "AOI FLOW",
  applicationName: "AOI FLOW",
  themeColor: "#0A1020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div id="_vignette" />
        <div id="_appRoot">
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </div>
      </body>
    </html>
  );
}