"use client";
/** The case picture: violet dashed lines are calls, blue lines are victims' money, grey lines are money leaving the bank.
 *  Small dots run along the money lines in the direction it moved; the main road the money took glows.
 *  Hover a box to light up its lines; click an account to jump to its row. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Graph, GNode } from "@/lib/server/graph";

const W = 144, H = 50, MIN_GAP = 28, ROW = 62, TOP = 36;

const fill: Record<GNode["kind"], string> = { phone: "var(--phone-tint)", victim: "#fff", mule: "#fff", innocent: "#fff", group: "var(--panel)", exit: "var(--panel)" };
const stroke: Record<GNode["kind"], string> = { phone: "var(--phone)", victim: "var(--line-strong)", mule: "var(--fg)", innocent: "var(--line-strong)", group: "var(--line-strong)", exit: "var(--line-strong)" };

export function TrailGraph({ g, reveal, pulse = true, showChain = true, legend = true }: { g: Graph; reveal?: number; pulse?: boolean; showChain?: boolean; legend?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  // Spread the columns across the full width of the box; on a phone keep the minimum gap and scroll sideways.
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ncols = g.cols.length;
  const GAP_X = Math.max(MIN_GAP, Math.min(90, ncols > 1 ? (avail - ncols * W) / (ncols - 1) : MIN_GAP));
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
  const colOf = useMemo(() => new Map(g.nodes.map((n) => [n.id, n.col])), [g]);
  const shown = (id: string) => reveal === undefined || (colOf.get(id) ?? 0) <= reveal;
  const chainEdges = useMemo(() => {
    const s = new Set<string>();
    if (showChain) for (let i = 1; i < g.chain.length; i++) s.add(`${g.chain[i - 1]}>${g.chain[i]}`);
    return s;
  }, [g, showChain]);
  const inChain = new Set(showChain ? g.chain : []);
  const rows = Math.max(1, ...g.cols.map((_, c) => g.nodes.filter((n) => n.col === c).length));
  const width = ncols * (W + GAP_X) - GAP_X;
  const height = TOP + rows * ROW;
  const maxAmt = Math.max(1, ...g.edges.map((e) => e.amount));
  const lit = (e: { from: string; to: string }) => hover !== null && (e.from === hover || e.to === hover);
  const geo = (e: { from: string; to: string }) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return null;
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
    return { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, col: a.x / (W + GAP_X) };
  };
  // Dots only on the bigger flows, so the picture stays calm.
  const pulsed = pulse && !still ? g.edges.filter((e) => e.kind !== "call" && (e.amount >= maxAmt * 0.08 || chainEdges.has(`${e.from}>${e.to}`))).slice(0, 40) : [];

  return (
    <div ref={box} className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white/55 p-3 backdrop-blur-xl" data-testid="trail-graph">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Money and phone trail for this case" className="block">
        <defs>
          <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        {g.cols.map((c, i) => (
          <text key={c} x={i * (W + GAP_X)} y={14} fontSize="10.5" fontWeight="700" letterSpacing="0.06em" fill={i === 0 ? "var(--phone)" : "var(--muted)"}
            style={{ textTransform: "uppercase", opacity: reveal === undefined || i <= reveal ? 1 : 0.25, transition: "opacity .5s" }}>{c}</text>
        ))}
        {/* The main road the money took: a soft glow under the line. */}
        {g.edges.filter((e) => chainEdges.has(`${e.from}>${e.to}`) && shown(e.from) && shown(e.to)).map((e, i) => {
          const q = geo(e);
          return q && <path key={`glow${i}`} d={q.d} fill="none" stroke={e.kind === "call" ? "var(--phone)" : "var(--accent)"} strokeWidth={10} opacity={hover ? 0.06 : 0.22} filter="url(#glow)" className="chain-glow" />;
        })}
        {g.edges.map((e) => {
          if (!shown(e.from) || !shown(e.to)) return null;
          const q = geo(e);
          if (!q) return null;
          const w = e.kind === "call" ? 1.5 : 1.2 + 5 * Math.sqrt(e.amount / maxAmt);
          const color = e.kind === "call" ? "var(--phone)" : e.kind === "exit" ? "#9aa3b2" : "var(--accent)";
          const dim = hover !== null && !lit(e);
          const main = chainEdges.has(`${e.from}>${e.to}`);
          return (
            <path key={`${e.from}>${e.to}>${e.kind}`} d={q.d} fill="none" stroke={color} strokeWidth={main ? w + 1 : w}
              pathLength={e.kind === "call" ? undefined : 1} className={e.kind === "call" ? "node-in" : "edge-draw"}
              strokeDasharray={e.kind === "call" ? "4 4" : undefined} opacity={dim ? 0.12 : main ? 0.9 : e.kind === "exit" ? 0.7 : 0.55}
              style={{ transition: "opacity .25s", animationDelay: `${150 + q.col * 180}ms` }}>
              <title>{e.kind === "call" ? `${e.calls ?? 1} call(s)` : `₹${Math.round(e.amount / 100).toLocaleString("en-IN")}`}</title>
            </path>
          );
        })}
        {pulsed.map((e, i) => {
          if (!shown(e.from) || !shown(e.to)) return null;
          const q = geo(e);
          if (!q) return null;
          const main = chainEdges.has(`${e.from}>${e.to}`);
          const dur = main ? 1.6 : 2.6 + (i % 5) * 0.35;
          return (
            <circle key={`p${e.from}>${e.to}`} r={main ? 3.6 : 2.6} fill={e.kind === "exit" ? "#8a93a3" : "var(--accent)"} opacity={hover && !lit(e) ? 0 : 0.95}>
              <animateMotion dur={`${dur}s`} begin={`-${(i % 7) * 0.37}s`} repeatCount="indefinite" path={q.d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
            </circle>
          );
        })}
        {g.nodes.map((n) => {
          if (!shown(n.id)) return null;
          const p = pos.get(n.id)!;
          const held = n.status === "held", pending = n.status === "pending";
          const chained = inChain.has(n.id);
          const node = (
            <g transform={`translate(${p.x},${p.y})`} className="node-in" style={{ animationDelay: `${n.col * 140}ms`, cursor: n.href ? "pointer" : "default" }}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} data-node={n.kind}>
              {chained && !still && <rect width={W} height={H} rx="2" fill="none" stroke={n.kind === "phone" ? "var(--phone)" : "var(--accent)"} strokeWidth="2" className="ring-pulse" />}
              <rect width={W} height={H} rx="2" fill={held ? "var(--accent-tint)" : fill[n.kind]} stroke={held ? "var(--accent)" : pending ? "var(--warn)" : chained && n.kind !== "phone" ? "var(--accent)" : stroke[n.kind]}
                strokeWidth={held || pending || chained || n.kind === "mule" ? 1.6 : 1} strokeDasharray={n.kind === "group" ? "3 3" : undefined} />
              {n.kind === "mule" && <circle cx={W - 12} cy={12} r={4} fill="var(--bad)"><title>Likely mule (mule score high)</title></circle>}
              <text x="10" y="20" fontSize="12.5" fontWeight="600" fill={n.kind === "phone" ? "var(--phone)" : "var(--fg)"}>{n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}</text>
              <text x="10" y="37" fontSize="11" fill={held ? "var(--accent-ink)" : "var(--muted)"}>{held ? `HELD · ${n.sub.replace("still here ", "")}` : pending ? `waiting approval · ${n.sub.replace("still here ", "")}` : n.sub}</text>
              {n.tip && <title>{n.tip}</title>}
            </g>
          );
          return n.href ? <a key={n.id} href={n.href}>{node}</a> : <g key={n.id}>{node}</g>;
        })}
      </svg>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] muted">
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--phone)" strokeDasharray="4 4" strokeWidth="1.5" /></svg>Scam calls</span>
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--accent)" strokeWidth="3" /></svg>Victims&apos; money (thicker = more)</span>
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#9aa3b2" strokeWidth="3" /></svg>Money that left the bank</span>
          {showChain && g.chain.length > 1 && <span className="inline-flex items-center gap-1.5"><svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--accent)" strokeWidth="6" opacity=".3" /><line x1="0" y1="5" x2="22" y2="5" stroke="var(--accent)" strokeWidth="2.5" /></svg>Main road the money took</span>}
          <span className="inline-flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--bad)" /></svg>Likely mule</span>
        </div>
      )}
    </div>
  );
}
