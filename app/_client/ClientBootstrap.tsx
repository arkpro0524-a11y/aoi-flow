// /app/_client/ClientBootstrap.tsx
"use client";

import { useEffect } from "react";
import { ensureAuthPersistence, ensureFirestorePersistence } from "@/firebase";

export default function ClientBootstrap() {
  useEffect(() => {
    void ensureAuthPersistence();
    void ensureFirestorePersistence();
  }, []);

  return null;
}