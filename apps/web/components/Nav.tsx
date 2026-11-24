"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { demo } from "@/lib/data";
import { useDesk } from "@/lib/desk";
import { RoleToggle } from "./ui/RoleToggle";
import { SPRING } from "./ui/motion";

export const LINKS = [
  { href: "/", label: "Inbox", purpose: "Open police requests and act on them" },
  { href: "/memo", label: "Hold memo", purpose: "Approve, notify and print one hold" },
  { href: "/replay", label: "72-hour replay", purpose: "Compare hold policies over 3 days" },
  { href: "/order", label: "Work order", purpose: "Choose which request comes first" },
  { href: "/results", label: "Results", purpose: "How the model did in our tests" },
] as const;

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="8" fill="var(--accent)" />
      <rect x="6" y="16.5" width="16" height="4.5" rx="1.4" fill="#fff" opacity="0.28" />
      <rect x="6" y="16.5" width="3.6" height="4.5" rx="1.4" fill="var(--hold-fill)" />
      <path d="M7.5 12.5 L21 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** One header, like the reference: brand on the left, pill links, and who you are working as on the right. */
export function Nav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  const { role, setRole, get } = useDesk();
  const open = demo.memo.cases.filter((c) => get(c.account).exact !== "approved").length;
  const waiting = demo.memo.cases.filter((c) => { const s = get(c.account); return s.exact === "proposed" || s.whole === "proposed"; }).length;

  const pills = (layoutId: string, tips = false) => LINKS.map(({ href, label, purpose }) => {
    const on = path === href;
    return (
      <Link key={href} href={href} aria-current={on ? "page" : undefined}
        className="group relative shrink-0 rounded-full px-4 py-2 text-[14.5px] font-medium transition-colors"
        style={{ color: on ? "var(--accent-ink)" : "var(--muted)" }}>
        {on && <m.span layoutId={layoutId} transition={SPRING} className="absolute inset-0 rounded-full"
          style={{ background: "rgba(11,85,99,0.09)", border: "1px solid rgba(11,85,99,0.22)", boxShadow: "0 1px 3px rgba(11,85,99,0.06)" }} />}
        {!on && <span className="absolute inset-0 rounded-full border border-transparent opacity-0 transition-all duration-150 group-hover:opacity-100 group-hover:-translate-y-px"
          style={{ background: "rgba(255,255,255,0.75)", borderColor: "rgba(0,0,0,0.08)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }} />}
        <span className={`relative ${on ? "font-semibold" : "group-hover:text-[var(--accent)]"}`}>{label}</span>
        {tips && (
          <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ background: "var(--fg)", color: "#fff", boxShadow: "var(--lift)" }}>{purpose}</span>
        )}
        {href === "/" && open > 0 && (
          <span className="relative ml-1.5 num text-[11.5px] font-semibold rounded-full px-1.5 py-px" style={{ background: "var(--hold-tint)", color: "var(--hold)" }} aria-label={`${open} open`}>{open}</span>
        )}
      </Link>
    );
  });

  return (
    <header className="no-print sticky top-0 z-40 glass rounded-none border-x-0 border-t-0" style={{ boxShadow: "none" }}>
      <div className="mx-auto max-w-[1480px] px-4 sm:px-5 lg:px-6 min-h-[72px] flex items-center gap-5">
        <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Scalpel home">
          <Logo />
          <span className="leading-tight">
            <strong className="block text-[19px] font-semibold tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>Scalpel</strong>
            <small className="hidden sm:block text-[11px] muted mt-0.5">Bharat Demo Bank · fraud hold desk</small>
          </span>
        </Link>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1.5 flex-1 justify-center">{pills("nav-pill", true)}</nav>
        <div className="ml-auto lg:ml-0 flex items-center gap-3 lg:border-l lg:pl-6" style={{ borderColor: "var(--line)" }}>
          <div className="hidden xl:block text-right leading-tight">
            <p className="text-[12px] font-semibold flex items-center justify-end gap-1.5">
              <i className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: waiting ? "var(--warn)" : "var(--good)" }} />
              {waiting ? `${waiting} waiting for a supervisor` : "Desk ready"}
            </p>
            <p className="text-[11px] muted mt-0.5">Demo roles, no login</p>
          </div>
          <span className="hidden lg:block"><RoleToggle role={role} setRole={setRole} /></span>
          <span className="lg:hidden"><RoleToggle role={role} setRole={setRole} suffix="-m" /></span>
        </div>
      </div>
      <nav aria-label="Main (menu)" className="lg:hidden flex gap-1 px-3 pb-2.5 overflow-x-auto">{pills("nav-pill-m")}</nav>
    </header>
  );
}

