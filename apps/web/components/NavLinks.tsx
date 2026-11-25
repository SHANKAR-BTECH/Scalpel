"use client";
/** The tabs next to the logo: one glass capsule, the open page sits in a raised glass pill inside it. */
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string; badge: number }[] }) {
  const path = usePathname();
  return (
    <nav className="tabbar order-last w-full overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
      {links.map((l) => {
        const on = path === l.href || path.startsWith(l.href + "/") || (l.href === "/inbox" && path.startsWith("/case/"));
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`tab ${on ? "tab-on" : ""}`}>
            {l.label}
            {l.badge > 0 && <span className="tab-badge">{l.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
