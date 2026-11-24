import Link from "next/link";

const LINKS = [
  ["/", "Headline"],
  ["/replay", "Same 30 days, four ways"],
  ["/memo", "Hold memo"],
  ["/order", "Who first?"],
] as const;

export function Nav() {
  return (
    <nav className="no-print flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm border-b" style={{ borderColor: "var(--line)" }}>
      <span className="font-semibold mr-2">Scalpel</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="underline-offset-4 hover:underline">{label}</Link>
      ))}
    </nav>
  );
}
