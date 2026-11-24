"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { demo } from "@/lib/data";
import { useDesk } from "@/lib/desk";
import { Segmented } from "./ui/Segmented";
import { SPRING } from "./ui/motion";

const LINKS = [
  { href: "/", label: "Inbox", hint: "Incoming hold requests", icon: InboxIcon },
  { href: "/memo", label: "Hold memo", hint: "Approve, print, notify", icon: DocIcon },
  { href: "/replay", label: "72 hours", hint: "Pick the bank's policy", icon: ClockIcon },
  { href: "/order", label: "Who first?", hint: "Set the work order", icon: QueueIcon },
] as const;

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="8" fill="var(--accent)" />
      <rect x="6" y="16.5" width="16" height="4.5" rx="1.4" fill="#fff" opacity="0.3" />
      <rect x="6" y="16.5" width="3.6" height="4.5" rx="1.4" fill="var(--hold)" />
      <path d="M7.5 12.5 L21 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Desktop: a dark glass rail on the left. Phone: a glass bar on top. Both carry the four desks and the role switch. */
export function Nav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  const { role, setRole, get } = useDesk();
  const open = demo.memo.cases.filter((c) => get(c.account).exact !== "approved").length;
  const waiting = demo.memo.cases.filter((c) => { const s = get(c.account); return s.exact === "proposed" || s.whole === "proposed"; }).length;

  return (
    <>
      <aside className="no-print hidden lg:flex fixed left-3 top-12 bottom-3 w-[244px] z-40 flex-col rounded-2xl p-3"
        style={{ background: "var(--rail)", color: "var(--rail-fg)", boxShadow: "var(--lift)" }}>
        <Link href="/" className="flex items-center gap-2.5 px-2 py-2">
          <Logo />
          <span className="leading-tight"><span className="block font-semibold tracking-tight">Scalpel</span>
            <span className="block text-[11.5px]" style={{ color: "var(--rail-muted)" }}>Bharat Demo Bank · fraud desk</span></span>
        </Link>
        <ul className="mt-5 grid gap-1">
          {LINKS.map(({ href, label, hint, icon: Icon }) => {
            const on = path === href;
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined} className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5">
                  {on && <m.span layoutId="rail-pill" transition={SPRING} className="absolute inset-0 rounded-xl" style={{ background: "rgba(255,255,255,0.09)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }} />}
                  <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <Icon on={on} />
                  <span className="relative flex-1 min-w-0">
                    <span className="block text-[14.5px] font-medium" style={{ color: on ? "#fff" : "var(--rail-fg)" }}>{label}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: "var(--rail-muted)" }}>{hint}</span>
                  </span>
                  {href === "/" && open > 0 && (
                    <span className="relative mono text-[11.5px] rounded-md px-1.5 py-0.5" style={{ background: "var(--hold)", color: "#1a0d00" }} aria-label={`${open} open`}>{open}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--rail-line)" }}>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--rail-muted)" }}>Working as</p>
          <div className="mt-2"><RoleSwitch role={role} setRole={setRole} dark /></div>
          <p className="text-[12px] mt-2 leading-snug" style={{ color: "var(--rail-muted)" }}>
            {role === "officer" ? "You propose holds. A supervisor must approve them." : "You approve or refuse what the officer proposed."}
            {waiting > 0 && <> <b style={{ color: "var(--rail-fg)" }}>{waiting} waiting for a supervisor.</b></>}
          </p>
          <p className="text-[11px] mt-2" style={{ color: "var(--rail-muted)" }}>Demo roles. No real login.</p>
        </div>
      </aside>

      <header className="no-print lg:hidden sticky top-0 z-40 glass rounded-none border-x-0 border-t-0">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/" className="flex items-center gap-2"><Logo size={24} /><span className="font-semibold">Scalpel</span></Link>
          <span className="ml-auto"><RoleSwitch role={role} setRole={setRole} suffix="-m" /></span>
        </div>
        <nav className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {LINKS.map(({ href, label }) => {
            const on = path === href;
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} className="relative shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-medium"
                style={{ color: on ? "var(--accent-ink)" : "var(--muted)" }}>
                {on && <m.span layoutId="top-pill" transition={SPRING} className="absolute inset-0 rounded-lg" style={{ background: "var(--accent-tint)" }} />}
                <span className="relative">{label}{href === "/" && open > 0 ? ` (${open})` : ""}</span>
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}

function RoleSwitch({ role, setRole, dark, suffix = "" }: { role: "officer" | "supervisor"; setRole: (r: "officer" | "supervisor") => void; dark?: boolean; suffix?: string }) {
  return (
    <Segmented label={`Acting as${suffix ? " (menu)" : ""}`} size="sm" value={role} onChange={setRole} dark={dark}
      options={[{ value: "officer", label: "Officer", testid: `role-officer${suffix}` }, { value: "supervisor", label: "Supervisor", testid: `role-supervisor${suffix}` }]} />
  );
}

type IconProps = { on: boolean };
const stroke = (on: boolean) => (on ? "#fff" : "var(--rail-muted)");
function InboxIcon({ on }: IconProps) {
  return <svg className="relative shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={stroke(on)} strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M3 11.5 5 4h10l2 7.5V16H3v-4.5Z" /><path d="M3 11.5h4.2l1 2h3.6l1-2H17" /></svg>;
}
function DocIcon({ on }: IconProps) {
  return <svg className="relative shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={stroke(on)} strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M5 2.5h7l3 3V17.5H5z" /><path d="M8 9.5h5M8 12.5h5M8 6.5h2" strokeLinecap="round" /></svg>;
}
function ClockIcon({ on }: IconProps) {
  return <svg className="relative shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={stroke(on)} strokeWidth="1.6" strokeLinecap="round" aria-hidden><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.8 1.8" /></svg>;
}
function QueueIcon({ on }: IconProps) {
  return <svg className="relative shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={stroke(on)} strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M4 5h12M4 10h8M4 15h5" /><path d="M15 12v5m0 0-2-2m2 2 2-2" strokeLinejoin="round" /></svg>;
}
