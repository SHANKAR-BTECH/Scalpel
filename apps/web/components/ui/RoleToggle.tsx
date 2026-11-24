"use client";
import * as m from "motion/react-m";
import type { Role } from "@/lib/desk";

const THUMB = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.7 };

/** Officer / Supervisor: one sliding thumb that stretches a little as it travels, like a physical switch. */
export function RoleToggle({ role, setRole, suffix = "" }: { role: Role; setRole: (r: Role) => void; suffix?: string }) {
  const opts: { value: Role; label: string; icon: React.ReactNode }[] = [
    { value: "officer", label: "Officer", icon: <path d="M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.5 6c.6-2.6 2.9-4.2 5.5-4.2s4.9 1.6 5.5 4.2" /> },
    { value: "supervisor", label: "Supervisor", icon: <path d="m6 10.2 2.6 2.6L14.5 7M10 2.8l6 2.4v4.3c0 3.6-2.5 6.2-6 7.7-3.5-1.5-6-4.1-6-7.7V5.2l6-2.4Z" /> },
  ];
  return (
    <div role="group" aria-label={`Working as${suffix ? " (menu)" : ""}`}
      className="relative inline-grid grid-cols-2 rounded-full p-1 select-none"
      style={{ background: "var(--bg-2)", boxShadow: "inset 0 1px 2px rgba(15,31,38,0.10)", border: "1px solid var(--line)" }}>
      {opts.map((o) => {
        const on = o.value === role;
        return (
          <m.button key={o.value} type="button" aria-pressed={on} data-testid={`role-${o.value}${suffix}`} onClick={() => setRole(o.value)}
            whileTap={{ scale: 0.95 }} transition={THUMB}
            className="relative z-[1] flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
            style={{ color: on ? "var(--on-accent)" : "var(--muted)", transition: "color 0.25s" }}>
            {on && (
              <m.span layoutId={`role-thumb${suffix}`} transition={THUMB} className="absolute inset-0 -z-[1] rounded-full"
                style={{ background: "linear-gradient(180deg, #0f6a7b, var(--accent))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px -4px rgba(11,85,99,0.6)" }} />
            )}
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{o.icon}</svg>
            {o.label}
          </m.button>
        );
      })}
    </div>
  );
}
