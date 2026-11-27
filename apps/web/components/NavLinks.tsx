"use client";
/** Top-bar pages in mono capitals; a yellow marker slides under the open one. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export function NavLinks({ links }: { links: { href: string; label: string; badge: number }[] }) {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(href + "/") || (href === "/inbox" && path.startsWith("/case/"));
  return (
    <nav className="tabbar order-last w-full overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
      {links.map((l) => {
        const on = isOn(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`tab ${on ? "tab-on" : ""}`}>
            {l.label}
            {l.badge > 0 && <span className="tab-badge">{l.badge}</span>}
            {on && <motion.span layoutId="nav-marker" className="tab-marker" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
