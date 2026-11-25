"use client";
/** Moves the soft light inside a glass button to follow the pointer. One listener for the whole page. */
import { useEffect } from "react";

export function GlassLight() {
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const b = (e.target as Element | null)?.closest?.(".btn") as HTMLElement | null;
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty("--mx", `${e.clientX - r.left}px`);
      b.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", on, { passive: true });
    return () => document.removeEventListener("pointermove", on);
  }, []);
  return null;
}
