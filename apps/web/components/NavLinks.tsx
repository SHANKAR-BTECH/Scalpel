"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string; badge: number }[] }) {
  const path = usePathname();
  return (
    <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
      {links.map((l) => {
        const on = path === l.href || path.startsWith(l.href + "/") || (l.href === "/inbox" && path.startsWith("/case/"));
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
            className={`relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-all duration-300 ${on ? "glass text-[var(--accent-ink)]" : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--fg)]"}`}>
            {l.label}
            {l.badge > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-bold text-white">{l.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
