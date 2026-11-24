"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { SPRING } from "./ui/motion";

const LINKS = [
  ["/", "Overview"],
  ["/replay", "Watch 72 hours"],
  ["/memo", "Hold memo"],
  ["/order", "Who first?"],
] as const;

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="7" fill="var(--accent)" />
      <rect x="6" y="15" width="14" height="4" rx="1.2" fill="#fff" opacity="0.35" />
      <rect x="6" y="15" width="3.2" height="4" rx="1.2" fill="#fff" />
      <path d="M7 11.5 L19.5 6.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  return (
    <header className="no-print sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: "var(--line)", background: "var(--nav-bg)" }}>
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Scalpel home">
          <Logo />
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">Scalpel</span>
            <span className="hidden md:block text-[11.5px] muted">Right-size fraud holds, with proof</span>
          </span>
        </Link>
        <ul className="ml-auto flex items-center gap-0.5 overflow-x-auto min-w-0 py-1 -my-1">
          {LINKS.map(([href, label]) => {
            const on = path === href;
            return (
              <li key={href} className="shrink-0">
                <Link href={href} aria-current={on ? "page" : undefined}
                  className="relative block rounded-full px-3 sm:px-4 py-1.5 text-[13.5px] sm:text-[14.5px] font-medium transition-colors"
                  style={{ color: on ? "var(--accent-ink)" : "var(--muted)" }}>
                  {on && (
                    <m.span layoutId="nav-pill" transition={SPRING} className="absolute inset-0 rounded-full"
                      style={{ background: "var(--accent-tint)", border: "1px solid var(--accent-line)" }} />
                  )}
                  <span className="relative">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
