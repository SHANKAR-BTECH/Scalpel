"use client";
/** The list of likely mules with filters, and a live mini-network for the one you pick. */
import { useMemo, useState } from "react";
import { inr, inrShort } from "@/lib/format";
import { CountUp } from "./CountUp";

export interface Link { label: string; kind: "victim" | "account" | "mule" | "exit"; amount: number }
export interface MuleRow {
  id: string; name: string; caseId: string; scamType: string; layer: number; score: number; reasons: string[];
  traced: number; received: number; balance: number; type: string; city: string; phone: string | null; signs: string[]; devices: string[];
  status: "held" | "pending" | null; ins: Link[]; outs: Link[];
}

const SORTS = { money: "Most money still in it", score: "Highest score", passed: "Most money passed through", layer: "Closest to the victims" } as const;

export function MuleBoard({ rows }: { rows: MuleRow[] }) {
  const [q, setQ] = useState("");
  const [cs, setCs] = useState("all");
  const [dev, setDev] = useState("all");
  const [sort, setSort] = useState<keyof typeof SORTS>("money");
  const [pick, setPick] = useState(rows[0]?.id ?? "");
  const cases = useMemo(() => [...new Set(rows.map((r) => r.caseId))].sort(), [rows]);
  const devices = useMemo(() => [...new Set(rows.flatMap((r) => r.devices))].sort(), [rows]);
  const list = useMemo(() => rows
    .filter((r) => (cs === "all" || r.caseId === cs) && (dev === "all" || r.devices.includes(dev)) && (!q || `${r.name} ${r.id} ${r.city}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === "score" ? b.score - a.score : sort === "passed" ? b.received - a.received : sort === "layer" ? a.layer - b.layer || b.traced - a.traced : b.traced - a.traced),
  [rows, q, cs, dev, sort]);
  const cur = list.find((r) => r.id === pick) ?? list[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" data-testid="mule-board">
      <div className="min-w-0">
        <div className="glass grid gap-2 rounded-2xl p-2 sm:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1.3fr]">
          <input className="input" placeholder="Search name, account or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search mules" />
          <select className="input" value={cs} onChange={(e) => setCs(e.target.value)} aria-label="Case"><option value="all">All cases</option>{cases.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="input" value={dev} onChange={(e) => setDev(e.target.value)} aria-label="Phone"><option value="all">All phones</option>{devices.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} aria-label="Sort">{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <p className="mt-2 px-1 text-[12.5px] muted">{list.length} of {rows.length} shown</p>
        <ul className="mt-1 space-y-2">
          {list.map((r, i) => {
            const on = cur?.id === r.id;
            return (
              <li key={r.id} className="pop-in" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                <button type="button" onClick={() => setPick(r.id)} data-testid="mule-row" aria-pressed={on}
                  className={`lift w-full rounded-2xl border p-3 text-left transition-colors duration-300 ${on ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-white/80 bg-white/55"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.name} {r.status === "held" ? <span className="chip chip-blue ml-1">Held</span> : r.status === "pending" ? <span className="chip chip-warn ml-1">Waiting</span> : null}</p>
                      <p className="text-[12.5px] muted"><span className="mono">{r.id}</span> · {r.caseId} · Layer {r.layer} · {r.city}</p>
                    </div>
                    <div className="text-right">
                      <p className="money text-[16px] text-[var(--accent)]">{inr(r.traced)}</p>
                      <p className="text-[11.5px] muted">still here</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]"><span className="bar-grow block h-full rounded-full bg-[var(--bad)]" style={{ width: `${r.score * 100}%`, animationDelay: `${Math.min(i, 12) * 35 + 150}ms` }} /></span>
                    <span className="mono text-[12px]">{Math.round(r.score * 100)}/100</span>
                  </div>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="panel p-4 text-[14px] muted">No mule accounts match.</li>}
        </ul>
      </div>

      <div className="min-w-0">
        {cur && (
          <div key={cur.id} className="card sticky top-20 p-5" data-testid="mule-detail">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label">{cur.caseId} · {cur.scamType} · Layer {cur.layer}</p>
                <h2 className="mt-1 text-[22px]">{cur.name}</h2>
                <p className="text-[13px] muted">{cur.type === "CURRENT" ? "Current" : cur.type === "SALARY" ? "Salary" : "Savings"} account <span className="mono">{cur.id}</span> · {cur.city}{cur.phone && <> · phone <span className="mono">{cur.phone}</span></>}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] muted">Mule score</p>
                <p className="money text-[30px] text-[var(--bad)]"><CountUp value={Math.round(cur.score * 100)} ms={700} /><span className="text-[15px] muted">/100</span></p>
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {cur.reasons.map((r, i) => <li key={r} className="chip chip-bad pop-in" style={{ animationDelay: `${150 + i * 120}ms` }}>{r}</li>)}
              {cur.signs.map((s, i) => <li key={s} className="chip chip-grey pop-in" style={{ animationDelay: `${450 + i * 100}ms` }}>{s}</li>)}
            </ul>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div className="panel p-3"><dt className="text-[12px] muted">Victims&apos; money in</dt><dd className="money text-[18px]"><CountUp value={cur.received} format="inrShort" ms={800} /></dd></div>
              <div className="panel p-3"><dt className="text-[12px] muted">Still here</dt><dd className="money text-[18px] text-[var(--accent)]"><CountUp value={cur.traced} format="inrShort" ms={800} /></dd></div>
              <div className="panel p-3"><dt className="text-[12px] muted">Balance today</dt><dd className="money text-[18px]"><CountUp value={cur.balance} format="inrShort" ms={800} /></dd></div>
            </dl>
            <p className="mt-4 text-[13px] font-semibold">Where the money came from and where it went next</p>
            <MiniNet r={cur} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] muted">{cur.devices.length > 0 ? `Scam calls in this case came from: ${cur.devices.join(", ")}` : ""}</p>
              <a href={`/case/${cur.caseId}#acct-${cur.id}`} className="btn btn-primary btn-sm">Open in {cur.caseId}</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const COLOR: Record<Link["kind"], string> = { victim: "var(--muted)", account: "var(--line-strong)", mule: "var(--bad)", exit: "#9aa3b2" };

function MiniNet({ r }: { r: MuleRow }) {
  const BW = 150, BH = 40, GAP = 10, width = 640;
  const rowsN = Math.max(1, r.ins.length, r.outs.length);
  const height = Math.max(BH + 20, rowsN * (BH + GAP) + 10);
  const cx = width / 2 - 75, cy = height / 2 - 26;
  const col = (items: Link[], x: number) => items.map((it, i) => ({ it, x, y: (height - items.length * (BH + GAP) + GAP) / 2 + i * (BH + GAP) }));
  const L = col(r.ins, 0), R = col(r.outs, width - BW);
  const max = Math.max(1, ...r.ins.map((x) => x.amount), ...r.outs.map((x) => x.amount));
  const path = (x1: number, y1: number, x2: number, y2: number) => { const m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
  const box = (it: Link, x: number, y: number, k: string, delay: number) => (
    <g key={k} transform={`translate(${x},${y})`} className="node-in" style={{ animationDelay: `${delay}ms` }}>
      <rect width={BW} height={BH} rx="2" fill={it.kind === "exit" ? "var(--panel)" : "#fff"} stroke={COLOR[it.kind]} strokeWidth={it.kind === "mule" ? 1.5 : 1} />
      {it.kind === "mule" && <circle cx={BW - 10} cy={10} r={3.5} fill="var(--bad)" />}
      <text x="9" y="17" fontSize="12" fontWeight="600" fill="var(--fg)">{it.label.length > 19 ? it.label.slice(0, 18) + "…" : it.label}</text>
      <text x="9" y="32" fontSize="10.5" fill="var(--muted)">{it.kind === "victim" ? "victim paid " : it.kind === "exit" ? "left the bank " : ""}{inrShort(it.amount)}</text>
    </g>
  );
  return (
    <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white/55 p-3">
      <svg width="100%" viewBox={`-4 -4 ${width + 8} ${height + 8}`} style={{ minWidth: 520 }} role="img" aria-label={`Money into and out of ${r.name}`}>
        {L.map(({ it, x, y }, i) => {
          const d = path(x + BW, y + BH / 2, cx, cy + 26);
          return <g key={`li${i}`}><path d={d} fill="none" stroke="var(--accent)" strokeWidth={1 + 4 * Math.sqrt(it.amount / max)} opacity=".5" pathLength={1} className="edge-draw" style={{ animationDelay: `${150 + i * 80}ms` }} />
            <circle r="3" fill="var(--accent)"><animateMotion dur={`${1.8 + (i % 3) * 0.3}s`} begin={`-${i * 0.37}s`} repeatCount="indefinite" path={d} /></circle></g>;
        })}
        {R.map(({ it, x, y }, i) => {
          const d = path(cx + 150, cy + 26, x, y + BH / 2);
          return <g key={`ro${i}`}><path d={d} fill="none" stroke={it.kind === "exit" ? "#9aa3b2" : "var(--accent)"} strokeWidth={1 + 4 * Math.sqrt(it.amount / max)} opacity=".55" pathLength={1} className="edge-draw" style={{ animationDelay: `${450 + i * 80}ms` }} />
            <circle r="3" fill={it.kind === "exit" ? "#8a93a3" : "var(--accent)"}><animateMotion dur={`${1.8 + (i % 3) * 0.3}s`} begin={`-${0.6 + i * 0.37}s`} repeatCount="indefinite" path={d} /></circle></g>;
        })}
        {L.map(({ it, x, y }, i) => box(it, x, y, `l${i}`, i * 80))}
        {R.map(({ it, x, y }, i) => box(it, x, y, `r${i}`, 400 + i * 80))}
        <g transform={`translate(${cx},${cy})`}>
          <rect width="150" height="52" rx="2" fill="none" stroke="var(--bad)" strokeWidth="2" className="ring-pulse" />
          <rect width="150" height="52" rx="2" fill="var(--bad-tint)" stroke="var(--bad)" strokeWidth="1.6" />
          <text x="11" y="21" fontSize="12.5" fontWeight="700" fill="var(--fg)">{r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name}</text>
          <text x="11" y="39" fontSize="11" fill="var(--bad)">score {Math.round(r.score * 100)} · {inrShort(r.traced)} here</text>
        </g>
        {r.ins.length === 0 && <text x="0" y={cy + 30} fontSize="11.5" fill="var(--muted)">No transfers in above ₹500</text>}
        {r.outs.length === 0 && <text x={width - BW} y={cy + 30} fontSize="11.5" fill="var(--muted)">Nothing passed on yet</text>}
      </svg>
    </div>
  );
}
