"use client";
import * as m from "motion/react-m";
import { formatRupees } from "@/lib/money";
import type { DemoData } from "@/lib/demo-schema";
import { EASE_OUT } from "./ui/motion";

type H = DemoData["headlineV2"]["axe"];
const reached = (h: H) => 1 - h.victimMoneyMissedPaise / h.victimMoneyPaise;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Whole freeze vs exact hold on the 5 unseen test worlds: what each one reaches, and what each one costs innocent people. */
export function TradeOff({ axe, exact }: { axe: H; exact: H }) {
  const cols = [
    { key: "axe", title: "Whole-account freeze", color: "var(--freeze)", tint: "var(--freeze-tint)", h: axe },
    { key: "exact", title: "Exact hold (Scalpel)", color: "var(--accent)", tint: "var(--accent-tint)", h: exact },
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="tradeoff">
      {cols.map((c, i) => (
        <div key={c.key} className="card lift p-5">
          <p className="font-semibold">{c.title}</p>
          <p className="text-[13px] muted mt-3">Victim money it reaches</p>
          <p className="mono text-[28px] font-medium leading-tight" style={{ color: c.color }}>{pct(reached(c.h))}</p>
          <m.div className="mt-2 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }} initial="off" whileInView="on" viewport={{ once: true }}>
            <m.div className="h-full rounded-full" style={{ background: c.color, width: `${reached(c.h) * 100}%`, transformOrigin: "left" }}
              variants={{ off: { scaleX: 0 }, on: { scaleX: 1 } }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 + 0.1 * i }} />
          </m.div>
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl p-3" style={{ background: c.tint }}>
            <div><dt className="text-[12.5px] muted">Innocent money locked</dt><dd className="num font-semibold text-lg">{formatRupees(c.h.innocentHeldPaise)}</dd></div>
            <div><dt className="text-[12.5px] muted">People wrongly restricted</dt><dd className="num font-semibold text-lg">{c.h.peopleWronglyRestricted.toLocaleString("en-IN")}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}
