"use client";
import { useEffect, useState } from "react";

export function Flash() {
  const [m, setM] = useState<{ ok: boolean; message: string; k: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setM({ ...(e as CustomEvent).detail, k: performance.now() });
    window.addEventListener("scalpel-flash", on);
    return () => window.removeEventListener("scalpel-flash", on);
  }, []);
  useEffect(() => { if (m) { const t = setTimeout(() => setM(null), 6000); return () => clearTimeout(t); } }, [m]);
  if (!m) return null;
  return (
    <div key={m.k} role="status" data-testid="flash" className={`slide-up fixed bottom-4 left-1/2 z-[70] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 glass rounded-2xl px-4 py-3 text-[14px] font-medium ${m.ok ? "text-[var(--fg)]" : "text-[var(--bad)]"}`}>
      {m.message}
    </div>
  );
}
