"use client";
import { useEffect, useRef } from "react";

/**
 * Fades a block up as it scrolls into view. The content is in the page from the start (no JavaScript, print and
 * screen readers see it all); the hidden starting state only applies once scripts run and the visitor allows motion.
 */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { el.dataset.shown = ""; io.disconnect(); }
    }, { rootMargin: "0px 0px -60px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Tag = as;
  return <Tag ref={ref as React.Ref<HTMLDivElement>} data-reveal className={className} style={delay ? { transitionDelay: `${delay}s` } : undefined}>{children}</Tag>;
}
