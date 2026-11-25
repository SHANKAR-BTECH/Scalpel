"use client";
/** The tabs next to the logo: one glass capsule with a lens that slides to the open tab, like iOS tab bars. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

export function NavLinks({ links }: { links: { href: string; label: string; badge: number }[] }) {
  const path = usePathname();
  const bar = useRef<HTMLElement>(null);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  const isOn = (href: string) => path === href || path.startsWith(href + "/") || (href === "/inbox" && path.startsWith("/case/"));
  const active = links.findIndex((l) => isOn(l.href));
  useLayoutEffect(() => {
    const place = () => {
      const el = bar.current?.querySelectorAll<HTMLElement>(".tab")[active];
      setLens(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, links.length]);
  return (
    <nav ref={bar} className="tabbar order-last w-full overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
      <span className="tab-lens" aria-hidden style={{ transform: `translateX(${lens?.x ?? 0}px)`, width: lens?.w ?? 0, opacity: lens ? 1 : 0 }} />
      {links.map((l, i) => (
        <Link key={l.href} href={l.href} aria-current={i === active ? "page" : undefined} className={`tab ${i === active ? "tab-on" : ""}`}>
          {l.label}
          {l.badge > 0 && <span className="tab-badge">{l.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
