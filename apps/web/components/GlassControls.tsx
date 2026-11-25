"use client";
/** iOS 27 touches: the Clear-to-Tinted glass slider, and the tint band that appears when content scrolls under the bar. */
import { useEffect, useRef, useState } from "react";
import { Droplet } from "lucide-react";

const KEY = "scalpel-glass";
const apply = (v: number) => document.documentElement.style.setProperty("--glass", String(v / 100));

export function GlassSlider() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(55);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { const s = Number(localStorage.getItem(KEY)); if (s >= 0 && s <= 100 && localStorage.getItem(KEY) !== null) { setV(s); apply(s); } } catch { /* storage blocked: keep the default */ }
  }, []);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const change = (n: number) => { setV(n); apply(n); try { localStorage.setItem(KEY, String(n)); } catch { /* fine */ } };
  return (
    <div ref={box} className="relative hidden sm:block">
      <button type="button" aria-label="Glass look" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="glass glass-round grid h-9 w-9 place-items-center text-[var(--accent)]" data-testid="glass-toggle">
        <Droplet size={16} aria-hidden />
      </button>
      {open && (
        <div className="pop-in glass absolute right-0 z-50 mt-2 w-[260px] rounded-[22px] p-4" data-testid="glass-panel">
          <p className="text-[13px] font-semibold">Glass</p>
          <input type="range" min={0} max={100} value={v} onChange={(e) => change(Number(e.target.value))} className="glass-range mt-3" aria-label="Glass, from clear to tinted" />
          <div className="mt-1.5 flex justify-between text-[12px] muted"><span>Clear</span><span>Tinted</span></div>
        </div>
      )}
    </div>
  );
}

export function ScrollEdge() {
  useEffect(() => {
    const on = () => { if (window.scrollY > 8) document.documentElement.setAttribute("data-scrolled", ""); else document.documentElement.removeAttribute("data-scrolled"); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return null;
}
