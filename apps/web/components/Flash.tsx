"use client";
import { useEffect, useState } from "react";

export function Flash() {
  const [m, setM] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setM((e as CustomEvent).detail);
    window.addEventListener("scalpel-flash", on);
    return () => window.removeEventListener("scalpel-flash", on);
  }, []);
  useEffect(() => { if (m) { const t = setTimeout(() => setM(null), 6000); return () => clearTimeout(t); } }, [m]);
  if (!m) return null;
  return (
    <div role="status" data-testid="flash" className={`fixed bottom-4 left-1/2 z-[70] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 rounded-xl px-4 py-3 text-[14px] font-medium text-white shadow-lg ${m.ok ? "bg-[var(--fg)]" : "bg-[var(--bad)]"}`}>
      {m.message}
    </div>
  );
}
