"use client";

import { useEffect } from "react";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .catch(() => {
        /* SW optional */
      });
  }, []);
  return null;
}
