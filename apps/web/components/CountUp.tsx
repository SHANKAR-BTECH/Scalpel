"use client";
/** A number that counts up smoothly when it first appears. */
import { useEffect, useRef, useState } from "react";
import { inr, inrShort } from "@/lib/format";

const FMT = { inr, inrShort, int: (n: number) => Math.round(n).toLocaleString("en-IN") };

export function CountUp({ value, format = "int", ms = 1100 }: { value: number; format?: keyof typeof FMT; ms?: number }) {
  const [n, setN] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    const from = first.current ? 0 : n;
    first.current = false;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 4);
      setN(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
  // Money is in paise: keep whole paise while counting so the format stays clean.
  return <>{FMT[format](format === "int" ? n : Math.round(n))}</>;
}
