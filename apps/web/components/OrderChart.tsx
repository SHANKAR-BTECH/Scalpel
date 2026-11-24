"use client";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DemoData } from "@/lib/demo-schema";
import { atAction, chartRows, DRAWN, ORDER_COLOR, ORDER_LABEL, pct } from "@/lib/order";

const KS = ["5", "10", "20"] as const;

/** % of the best possible rescue after each action, mean line with a min-max band over the 5 v2 worlds. */
export function OrderChart({ byK }: { byK: DemoData["order"]["byK"] }) {
  const [k, setK] = useState<(typeof KS)[number]>("10");
  const [table, setTable] = useState(false);
  const c = byK[k]!;
  const rows = chartRows(c);
  const last = c.scalpel.x[c.scalpel.x.length - 1]!;
  const checkpoints = [10, 50, 100, 200, last].filter((v, i, a) => v <= last && a.indexOf(v) === i);
  return (
    <figure className="card p-4">
      <figcaption className="font-semibold">Money secured as the officer works down the list</figcaption>
      <p className="text-xs muted">% of the best possible, after each account acted on. Line: average of 5 unseen worlds. Shaded: lowest to highest world. The dashed line is the order with the best final total, so early on it can sit below the others. <span className="tag">known only afterwards</span></p>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-sm" role="group" aria-label="Officer capacity">
        <span>Accounts an hour (K):</span>
        {KS.map((v) => (
          <button key={v} type="button" aria-pressed={k === v} data-testid={`k-${v}`} onClick={() => setK(v)}
            className="rounded-md px-2 py-0.5 border" style={{ borderColor: "var(--line)", fontWeight: k === v ? 600 : 400, background: k === v ? "var(--card)" : "transparent" }}>{v}</button>
        ))}
        <button type="button" className="ml-auto underline text-sm" onClick={() => setTable((t) => !t)} data-testid="table-toggle">{table ? "Show chart" : "Show as table"}</button>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" aria-label="Legend">
        {DRAWN.map((n) => (
          <li key={n} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke={ORDER_COLOR[n]} strokeWidth="2" strokeDasharray={n === "oracle" ? "4 3" : undefined} /></svg>
            {ORDER_LABEL[n]}
          </li>
        ))}
      </ul>
      {table ? (
        <div className="overflow-x-auto mt-2">
          <table className="text-sm w-full" data-testid="order-table">
            <thead><tr className="text-left"><th className="pr-3">Order</th>{checkpoints.map((a) => <th key={a} className="pr-3">after {a}</th>)}</tr></thead>
            <tbody>{DRAWN.map((n) => <tr key={n}><td className="pr-3">{ORDER_LABEL[n]}</td>{checkpoints.map((a) => <td key={a} className="pr-3 tabular-nums">{pct(atAction(c, n, a))}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 mt-2" data-testid="order-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="x" type="number" domain={[1, last]} stroke="var(--muted)" fontSize={11} tickCount={6} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="var(--muted)" fontSize={11} width={40} />
              <Tooltip formatter={(v, name) => (Array.isArray(v) ? null : [pct(Number(v)), ORDER_LABEL[name as keyof typeof ORDER_LABEL] ?? String(name)])}
                labelFormatter={(x) => `After ${x} accounts`} />
              {DRAWN.filter((n) => n !== "oracle").map((n) => (
                <Area key={`${n}Band`} dataKey={`${n}Band`} stroke="none" fill={ORDER_COLOR[n]} fillOpacity={0.12} isAnimationActive={false} legendType="none" tooltipType="none" />
              ))}
              {DRAWN.map((n) => (
                <Line key={n} dataKey={n} stroke={ORDER_COLOR[n]} strokeWidth={2} dot={false} isAnimationActive={false} strokeDasharray={n === "oracle" ? "5 4" : undefined} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs muted mt-2">At the end of the list: model {pct(atAction(c, "scalpel", last))}, biggest amount first {pct(atAction(c, "biggest", last))}, warning-sign rule {pct(atAction(c, "signrule", last))}.</p>
    </figure>
  );
}
