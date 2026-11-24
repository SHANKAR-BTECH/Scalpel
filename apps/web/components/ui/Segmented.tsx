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
    <div role="group" aria-label={label} className={`inline-flex flex-wrap gap-0.5 rounded-full p-1 ${className}`}
      style={dark ? { background: "rgba(0,0,0,0.25)" } : { background: "rgba(33,63,115,0.05)", border: "1px solid var(--line)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <m.button key={o.value} type="button" aria-pressed={on} data-testid={o.testid} onClick={() => onChange(o.value)}
            className={`relative rounded-full font-semibold transition-colors ${pad}`} style={{ color: on ? (dark ? "var(--on-accent)" : "var(--accent-ink)") : dark ? "rgba(255,255,255,0.7)" : "var(--muted)" }}
            whileTap={{ scale: 0.96 }} transition={SPRING}>
            {on && (
              <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full" transition={SPRING}
                style={dark ? { background: "var(--accent)" } : { background: "var(--card)", border: "1px solid var(--accent-line)", boxShadow: "0 1px 3px rgba(33,63,115,0.10)" }} />
            )}
            <span className="relative">{o.label}</span>
          </m.button>
        );
      })}
    </div>
  );
}
