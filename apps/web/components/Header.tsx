/** Top bar: the Scalpel mark, the pages this person can use, the demo clock, the bell and who is signed in. */
import Link from "next/link";
import { currentUser, holderRef } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { store } from "@/lib/server/store";
import { alerts } from "@/lib/server/telco";
import { logout } from "@/app/actions";
import { LiveBell } from "./Live";
import { NavLinks } from "./NavLinks";
import { when } from "@/lib/format";
import type { Role } from "@/lib/users";

const LINKS: Record<Role | "public", { href: string; label: string }[]> = {
  officer: [{ href: "/inbox", label: "Inbox" }, { href: "/mules", label: "Mules" }, { href: "/holds", label: "Holds" }],
  supervisor: [{ href: "/approvals", label: "Approvals" }, { href: "/holds", label: "Holds" }, { href: "/inbox", label: "Inbox" }, { href: "/mules", label: "Mules" }],
  auditor: [{ href: "/assure", label: "Assure" }, { href: "/mules", label: "Mules" }, { href: "/holds", label: "Holds" }],
  telco: [{ href: "/telco", label: "Alerts" }],
  admin: [{ href: "/admin", label: "Admin" }],
  public: [{ href: "/portal", label: "Account holder" }, { href: "/verify", label: "Verify a file" }],
};

export async function Header() {
  const u = await currentUser();
  const ref = await holderRef();
  const d = u ? await desk() : null;
  const s = await store();
  const badge: Record<string, number> = {};
  if (d && u?.role === "supervisor") badge["/approvals"] = d.proposals.filter((p) => p.status === "pending").length;
  if (d && u?.role === "telco") badge["/telco"] = d.asks.filter((a) => !a.done).length + alerts().filter((a) => !d.telcoByAlert.has(a.id)).length;
  const links = (u ? LINKS[u.role] : LINKS.public).map((l) => ({ ...l, badge: badge[l.href] ?? 0 }));
  return (
    <header className="topbar sticky top-0 z-40 no-print">
      <div className="mx-auto flex w-full max-w-[1760px] flex-wrap items-center gap-x-8 gap-y-1 px-4 py-2.5 sm:px-6 lg:px-10">
        <Link href={u ? u.home : "/"} className="flex items-center gap-2" aria-label="Scalpel home">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" fill="#0d0d0d" /><path d="M8 22 L22 8 L24 10 L12 22 Z" fill="var(--hi)" /></svg>
          <span className="title text-[15px]">Scalpel</span>
        </Link>
        <span className="demo-tag -ml-5" title="Fictional people, banks and numbers. Not legal advice." data-testid="demo-tag">Demo</span>
        <NavLinks links={links} />
        <div className="ml-auto flex items-center gap-2.5">
          {d && <span className="hidden items-center gap-1.5 text-[12.5px] muted md:flex" title="Demo clock" data-testid="demo-clock"><span className="live-dot" />{when(d.now)}</span>}
          {s.kind === "memory" && u?.role === "admin" && <span className="chip chip-warn">Memory store</span>}
          <LiveBell signedIn={Boolean(u || ref)} />
          {u ? (
            <form action={logout} className="flex items-center gap-2">
              <span className="hidden text-right leading-tight sm:block"><span className="block text-[13px] font-semibold">{u.name}</span><span className="block text-[11.5px] muted">{u.title} · {u.org}</span></span>
              <button className="btn btn-ghost btn-sm" data-testid="sign-out">Sign out</button>
            </form>
          ) : ref ? (
            <form action={logout}><button className="btn btn-ghost btn-sm">Leave</button></form>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm" data-testid="sign-in">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
