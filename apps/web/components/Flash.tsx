"use client";
/** The answer to the last action, at the bottom of the screen; it slides in and out. */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function Flash() {
  const [m, setM] = useState<{ ok: boolean; message: string; k: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setM({ ...(e as CustomEvent).detail, k: performance.now() });
    window.addEventListener("scalpel-flash", on);
    return () => window.removeEventListener("scalpel-flash", on);
  }, []);
  useEffect(() => { if (m) { const t = setTimeout(() => setM(null), 6000); return () => clearTimeout(t); } }, [m]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <AnimatePresence>
        {m && (
          <motion.div key="flash" role="status" data-testid="flash" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className={`pointer-events-auto w-full max-w-[520px] border bg-white px-4 py-3 text-[14px] font-medium ${m.ok ? "border-[#0d0d0d] shadow-[inset_4px_0_0_var(--hi)]" : "border-[var(--bad)] text-[var(--bad)]"}`}>
            <motion.span key={m.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="block">{m.message}</motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
