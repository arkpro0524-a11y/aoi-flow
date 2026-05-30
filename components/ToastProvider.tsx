// /components/ToastProvider.tsx
"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type Toast = { id: string; text: string };
type ToastCtx = { push: (text: string) => void };
const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const api = useMemo<ToastCtx>(() => {
    return {
      push(text: string) {
        const id = `${Date.now()}_${Math.random()}`;
        setToasts((p) => [...p, { id, text }]);
        setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 2200);
      },
    };
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl bg-black/80 px-4 py-3 text-sm text-white ring-1 ring-white/10 backdrop-blur"
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}