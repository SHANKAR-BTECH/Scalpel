"use client";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatRupees, shortRupees } from "@/lib/money";
import type { DemoData } from "@/lib/demo-schema";

/** The 30 days before the bank decides: victim money paid each day, and complaints made. */
export function Timeline30d({ days }: { days: DemoData["replay"]["timeline"] }) {
  const complaints = days.reduce((s, d) => s + d.complaints, 0);
  return (
    <figure>
      <figcaption className="font-semibold text-[16px]">The 30 days before the bank decides</figcaption>
      <p className="text-xs muted">Bars: victim money paid each day. {complaints} complaints arrived; the bank decides at the end of day 30. <span className="tag">known only afterwards</span></p>
      <div className="h-40 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} interval={4} />
            <YAxis tickFormatter={shortRupees} stroke="var(--muted)" fontSize={11} width={56} />
            <Tooltip formatter={(v, n) => (n === "victimPaidPaise" ? [formatRupees(Number(v)), "Victim money paid"] : [String(v), "Complaints"])} labelFormatter={(d) => `Day ${d}`} />
            <Bar dataKey="victimPaidPaise" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            <ReferenceLine x={30} stroke="var(--fg)" strokeDasharray="4 3" label={{ value: "decision", fill: "var(--muted)", fontSize: 10, position: "insideTopRight" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
