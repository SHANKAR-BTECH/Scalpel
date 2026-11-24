"use client";
import { useId } from "react";
import * as m from "motion/react-m";
import { SPRING } from "./motion";

export type Option<T extends string> = { value: T; label: React.ReactNode; testid?: string };

/** A row of choices with a pill that slides to the picked one. Buttons keep aria-pressed so tests and screen readers see the state. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md", className = "", dark }:
  { options: Option<T>[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md"; className?: string; dark?: boolean }) {
  const id = useId();
  const pad = size === "sm" ? "px-3 py-1 text-[13px]" : "px-4 py-1.5 text-sm";
  return (
    <div role="group" aria-label={label} className={`inline-flex flex-wrap gap-0.5 rounded-xl p-1 ${className}`}
      style={dark ? { background: "rgba(0,0,0,0.25)", border: "1px solid var(--rail-line)" } : { background: "var(--bg-2)", border: "1px solid var(--line)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <m.button key={o.value} type="button" aria-pressed={on} data-testid={o.testid} onClick={() => onChange(o.value)}
            className={`relative rounded-lg font-semibold transition-colors ${pad}`} style={{ color: on ? (dark ? "var(--on-accent)" : "var(--accent-ink)") : dark ? "var(--rail-muted)" : "var(--muted)" }}
            whileTap={{ scale: 0.96 }} transition={SPRING}>
            {on && (
              <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg" transition={SPRING}
                style={dark ? { background: "var(--accent)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)" } : { background: "var(--card)", border: "1px solid var(--accent-line)", boxShadow: "var(--inset), var(--shadow)" }} />
            )}
            <span className="relative">{o.label}</span>
          </m.button>
        );
      })}
    </div>
  );
}
