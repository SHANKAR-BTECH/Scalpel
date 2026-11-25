"use client";
/** The case picture: violet dashed lines are calls, blue lines are victims' money, grey lines are money leaving the bank.
 *  Hover a box to light up its lines; click an account to jump to its row. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Graph, GNode } from "@/lib/server/graph";

const W = 144, H = 50, MIN_GAP = 28, ROW = 62, TOP = 36;

const fill: Record<GNode["kind"], string> = { phone: "var(--phone-tint)", victim: "#fff", mule: "#fff", innocent: "#fff", group: "var(--panel)", exit: "var(--panel)" };
const stroke: Record<GNode["kind"], string> = { phone: "var(--phone)", victim: "var(--line-strong)", mule: "var(--fg)", innocent: "var(--line-strong)", group: "var(--line-strong)", exit: "var(--line-strong)" };

export function TrailGraph({ g }: { g: Graph }) {
  const [hover, setHover] = useState<string | null>(null);
  // Spread the columns across the full width of the box; on a phone keep the minimum gap and scroll sideways.
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = g.cols.length;
  const GAP_X = Math.max(MIN_GAP, Math.min(90, n > 1 ? (avail - n * W) / (n - 1) : MIN_GAP));
  const pos = useMemo(() => {
    const p = new Map<string, { x: number; y: number }>();
    const byCol = new Map<number, GNode[]>();
    for (const n of g.nodes) byCol.set(n.col, [...(byCol.get(n.col) ?? []), n]);
    for (const [col, ns] of byCol) {
      ns.sort((a, b) => (a.kind === "group" ? 1 : 0) - (b.kind === "group" ? 1 : 0) || b.amount - a.amount || a.label.localeCompare(b.label));
      ns.forEach((n, i) => p.set(n.id, { x: col * (W + GAP_X), y: TOP + i * ROW }));
    }
    return p;
  }, [g, GAP_X]);
  const rows = Math.max(1, ...g.cols.map((_, c) => g.nodes.filter((n) => n.col === c).length));
  const width = g.cols.length * (W + GAP_X) - GAP_X;
  const height = TOP + rows * ROW;
  const maxAmt = Math.max(1, ...g.edges.map((e) => e.amount));
  const lit = (e: { from: string; to: string }) => hover !== null && (e.from === hover || e.to === hover);

  return (
    <div ref={box} className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white/90 p-3" data-testid="trail-graph">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Money and phone trail for this case" className="block">
        {g.cols.map((c, i) => (
          <text key={c} x={i * (W + GAP_X)} y={14} fontSize="10.5" fontWeight="700" letterSpacing="0.06em" fill={i === 0 ? "var(--phone)" : "var(--muted)"} style={{ textTransform: "uppercase" }}>{c}</text>
        ))}
        {g.edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
          const w = e.kind === "call" ? 1.5 : 1.2 + 5 * Math.sqrt(e.amount / maxAmt);
          const color = e.kind === "call" ? "var(--phone)" : e.kind === "exit" ? "#9aa3b2" : "var(--accent)";
          const dim = hover !== null && !lit(e);
          return (
            <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={w}
              pathLength={e.kind === "call" ? undefined : 1} className={e.kind === "call" ? "node-in" : "edge-draw"}
              strokeDasharray={e.kind === "call" ? "4 4" : undefined} opacity={dim ? 0.12 : e.kind === "exit" ? 0.7 : 0.55}
              style={{ transition: "opacity .25s", animationDelay: `${150 + (a.x / (W + GAP_X)) * 180}ms` }}>
              <title>{e.kind === "call" ? `${e.calls ?? 1} call(s)` : `₹${Math.round(e.amount / 100).toLocaleString("en-IN")}`}</title>
            </path>
          );
        })}
        {g.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const held = n.status === "held", pending = n.status === "pending";
          const box = (
            <g transform={`translate(${p.x},${p.y})`} className="node-in" style={{ animationDelay: `${(n.col * 140)}ms`, cursor: n.href ? "pointer" : "default" }} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} data-node={n.kind}>
              <rect width={W} height={H} rx="10" fill={held ? "var(--accent-tint)" : fill[n.kind]} stroke={held ? "var(--accent)" : pending ? "var(--warn)" : stroke[n.kind]}
                strokeWidth={held || pending || n.kind === "mule" ? 1.6 : 1} strokeDasharray={n.kind === "group" ? "3 3" : undefined} />
              {n.kind === "mule" && <circle cx={W - 12} cy={12} r={4} fill="var(--bad)"><title>Likely mule (mule score high)</title></circle>}
              <text x="10" y="20" fontSize="12.5" fontWeight="600" fill={n.kind === "phone" ? "var(--phone)" : "var(--fg)"}>{n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}</text>
              <text x="10" y="37" fontSize="11" fill={held ? "var(--accent-ink)" : "var(--muted)"}>{held ? `HELD · ${n.sub.replace("still here ", "")}` : pending ? `waiting approval · ${n.sub.replace("still here ", "")}` : n.sub}</text>
              {n.tip && <title>{n.tip}</title>}
            </g>
          );
          return n.href ? <a key={n.id} href={n.href}>{box}</a> : <g key={n.id}>{box}</g>;
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] muted">
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--phone)" strokeDasharray="4 4" strokeWidth="1.5" /></svg>Scam calls</span>
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--accent)" strokeWidth="3" /></svg>Victims' money (thicker = more)</span>
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#9aa3b2" strokeWidth="3" /></svg>Money that left the bank</span>
        <span className="inline-flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--bad)" /></svg>Likely mule</span>
      </div>
    </div>
  );
}
