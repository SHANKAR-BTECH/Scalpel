"use client";
import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatRupees, shortRupees } from "@/lib/money";
import { POLICY_KEYS, type DemoData } from "@/lib/demo-schema";
import { POLICY_LABEL } from "@/lib/policies";

/** One dot per policy: innocent money locked (across) against victim money missed (up). Lower-left is better. */
export function TradeOff({ headline }: { headline: DemoData["headline"] }) {
  const pts = POLICY_KEYS.map((k) => ({ name: POLICY_LABEL[k], x: headline[k].innocentHeldPaise, y: headline[k].victimMoneyMissedPaise }));
  return (
    <figure className="card p-4">
      <figcaption className="font-semibold">The trade-off: locking innocent money vs missing victim money</figcaption>
      <p className="text-xs muted">All four saw the same complaints. Lower and further left is better. Exact hold and Scalpel sit on the same dot.</p>
      <div className="h-64 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="var(--line)" />
            <XAxis type="number" dataKey="x" name="Innocent money locked" tickFormatter={shortRupees} stroke="var(--muted)" fontSize={11}
              label={{ value: "Innocent money locked", position: "insideBottom", offset: -12, fill: "var(--muted)", fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name="Victim money missed" tickFormatter={shortRupees} stroke="var(--muted)" fontSize={11} width={64} />
            <Tooltip formatter={(v) => formatRupees(Number(v))} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={pts} fill="var(--s1)">
              <LabelList dataKey="name" position="top" fill="var(--fg)" fontSize={11} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Trade-off data</caption>
        <tbody>{pts.map((p) => <tr key={p.name}><th>{p.name}</th><td>{formatRupees(p.x)}</td><td>{formatRupees(p.y)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
