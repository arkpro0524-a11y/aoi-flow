import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import ClientCrashGuard from "@/components/ClientCrashGuard";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ClientCrashGuard>
          <ToastProvider>{children}</ToastProvider>
        </ClientCrashGuard>
      </body>
    </html>
  );
}