"use client";
import Link from "next/link";
import * as m from "motion/react-m";
import { SPRING } from "./motion";

type Variant = "primary" | "secondary" | "ghost";
const STYLE: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent-ink)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 6px 16px -8px rgba(33,63,115,0.55)" },
  secondary: { background: "rgba(255,255,255,0.7)", color: "var(--fg)", border: "1px solid rgba(0,0,0,0.12)", boxShadow: "0 2px 8px rgba(33,63,115,0.05), inset 0 1px 0 rgba(255,255,255,0.85)" },
  ghost: { background: "transparent", color: "var(--accent-ink)", border: "1px solid transparent" },
};
const BASE = "inline-flex items-center justify-center gap-2 min-h-[42px] rounded-[14px] px-5 py-2 text-[14.5px] font-[550] tracking-[-0.01em] transition-[background-color,border-color,box-shadow] duration-200 hover:brightness-[1.04] select-none disabled:opacity-40 disabled:cursor-not-allowed";
const MLink = m.create(Link);

/** Press-in button: lifts a pixel on hover, sinks slightly on press, on one shared spring. */
export function Button({ variant = "secondary", className = "", style, children, ...rest }:
  { variant?: Variant } & Omit<React.ComponentProps<typeof m.button>, "children"> & { children: React.ReactNode }) {
  const disabled = Boolean(rest.disabled);
  return (
    <m.button type="button" className={`${BASE} ${className}`} style={{ ...STYLE[variant], ...style }}
      whileHover={disabled ? undefined : { y: -1 }} whileTap={disabled ? undefined : { scale: 0.97, y: 0 }} transition={SPRING} {...rest}>
      {children}
    </m.button>
  );
}

export function ButtonLink({ href, variant = "secondary", className = "", children, ...rest }:
  { href: string; variant?: Variant; className?: string; children: React.ReactNode } & Record<`data-${string}`, string>) {
  return (
    <MLink href={href} className={`${BASE} ${className}`} style={STYLE[variant]} initial="rest" whileHover="hover" whileTap="tap" variants={{ rest: { y: 0, scale: 1 }, hover: { y: -1 }, tap: { scale: 0.97, y: 0 } }} transition={SPRING} {...rest}>
      {children}
      {variant !== "ghost" && <Arrow />}
    </MLink>
  );
}

function Arrow() {
  return (
    <m.svg width="14" height="14" viewBox="0 0 16 16" aria-hidden variants={{ rest: { x: 0 }, hover: { x: 3 }, tap: { x: 3 } }} transition={SPRING}>
      <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </m.svg>
  );
}
