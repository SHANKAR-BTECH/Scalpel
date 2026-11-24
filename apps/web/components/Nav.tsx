"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { demo } from "@/lib/data";
import { useDesk } from "@/lib/desk";
import { Segmented } from "./ui/Segmented";
import { SPRING } from "./ui/motion";

const LINKS = [
  { href: "/", label: "Inbox" },
  { href: "/memo", label: "Hold memo" },
  { href: "/replay", label: "72-hour replay" },
  { href: "/order", label: "Work order" },
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

  const pills = (layoutId: string) => LINKS.map(({ href, label }) => {
    const on = path === href;
    return (
      <Link key={href} href={href} aria-current={on ? "page" : undefined}
        className="group relative shrink-0 rounded-full px-4 py-2 text-[14.5px] font-medium transition-colors"
        style={{ color: on ? "var(--accent-ink)" : "#454d55" }}>
        {on && <m.span layoutId={layoutId} transition={SPRING} className="absolute inset-0 rounded-full"
          style={{ background: "rgba(33,63,115,0.09)", border: "1px solid rgba(33,63,115,0.22)", boxShadow: "0 1px 3px rgba(33,63,115,0.06)" }} />}
        {!on && <span className="absolute inset-0 rounded-full border border-transparent opacity-0 transition-all duration-150 group-hover:opacity-100 group-hover:-translate-y-px"
          style={{ background: "rgba(255,255,255,0.75)", borderColor: "rgba(0,0,0,0.08)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }} />}
        <span className={`relative ${on ? "font-semibold" : "group-hover:text-[var(--accent)]"}`}>{label}</span>
        {href === "/" && open > 0 && (
          <span className="relative ml-1.5 num text-[11.5px] font-semibold rounded-full px-1.5 py-px" style={{ background: "var(--hold-tint)", color: "var(--hold)" }} aria-label={`${open} open`}>{open}</span>
        )}
      </Link>
    );
  });

  return (
    <header className="no-print sticky top-0 z-40 glass rounded-none border-x-0 border-t-0" style={{ boxShadow: "none" }}>
      <div className="mx-auto max-w-[1260px] px-4 sm:px-6 lg:px-9 min-h-[76px] flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Scalpel home">
          <Logo />
          <span className="leading-tight">
            <strong className="block text-[18px] font-semibold tracking-[-0.035em]">Scalpel</strong>
            <small className="hidden sm:block text-[11px] muted mt-0.5">Bharat Demo Bank · fraud hold desk</small>
          </span>
        </Link>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1.5 flex-1 justify-center">{pills("nav-pill")}</nav>
        <div className="ml-auto lg:ml-0 flex items-center gap-3 lg:border-l lg:pl-6" style={{ borderColor: "var(--line)" }}>
          <div className="hidden xl:block text-right leading-tight">
            <p className="text-[12px] font-semibold flex items-center justify-end gap-1.5">
              <i className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: waiting ? "var(--warn)" : "var(--good)" }} />
              {waiting ? `${waiting} waiting for a supervisor` : "Desk ready"}
            </p>
            <p className="text-[11px] muted mt-0.5">Demo roles, no login</p>
          </div>
          <span className="hidden lg:block"><RoleSwitch role={role} setRole={setRole} /></span>
          <span className="lg:hidden"><RoleSwitch role={role} setRole={setRole} suffix="-m" /></span>
        </div>
      </div>
      <nav aria-label="Main (menu)" className="lg:hidden flex gap-1 px-3 pb-2.5 overflow-x-auto">{pills("nav-pill-m")}</nav>
    </header>
  );
}

function RoleSwitch({ role, setRole, suffix = "" }: { role: "officer" | "supervisor"; setRole: (r: "officer" | "supervisor") => void; suffix?: string }) {
  return (
    <Segmented label={`Working as${suffix ? " (menu)" : ""}`} size="sm" value={role} onChange={setRole}
      options={[{ value: "officer", label: "Officer", testid: `role-officer${suffix}` }, { value: "supervisor", label: "Supervisor", testid: `role-supervisor${suffix}` }]} />
  );
}
