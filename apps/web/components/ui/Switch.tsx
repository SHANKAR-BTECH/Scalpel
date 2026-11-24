"use client";
import * as m from "motion/react-m";
import { SPRING } from "./motion";

/** An on/off switch whose knob springs across. It is a real button with role="switch". */
export function Switch({ checked, onChange, label, testid }: { checked: boolean; onChange: (v: boolean) => void; label: string; testid?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} data-testid={testid} onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-sm font-medium select-none">
      <span className="relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-200"
        style={{ background: checked ? "var(--accent)" : "var(--line-strong)", justifyContent: checked ? "flex-end" : "flex-start" }}>
        <m.span layout transition={SPRING} className="block h-5 w-5 rounded-full" style={{ background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
      </span>
      {label}
    </button>
  );
}
