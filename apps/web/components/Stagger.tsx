"use client";
/** Rows glide in one after another when a list first appears (Framer Motion's stagger), then stay put. */
import { useEffect } from "react";
import { stagger, useAnimate } from "framer-motion";

export function Stagger({ as: Tag = "div", className, children, ...rest }: { as?: "div" | "ul"; className?: string; children: React.ReactNode; [k: `data-${string}`]: string }) {
  const [scope, animate] = useAnimate<HTMLDivElement & HTMLUListElement>();
  useEffect(() => {
    const rows = scope.current ? Array.from(scope.current.children).filter((el) => !el.classList.contains("board-head")) : [];
    if (!rows.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate(rows, { opacity: [0, 1], y: [10, 0] }, { duration: 0.42, ease: [0.2, 0.8, 0.2, 1], delay: stagger(0.035) });
  }, [animate, scope]);
  return Tag === "ul" ? <ul ref={scope} className={className} {...rest}>{children}</ul> : <div ref={scope} className={className} {...rest}>{children}</div>;
}
