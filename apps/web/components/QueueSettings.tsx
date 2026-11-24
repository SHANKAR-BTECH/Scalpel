"use client";
import Link from "next/link";
import * as m from "motion/react-m";
import { demo } from "@/lib/data";
import { atAction, pct } from "@/lib/order";
import { formatRupees } from "@/lib/money";
import { maskAccount } from "@/lib/rules";
import { RULE_LABEL, sortCases, useDesk, type Rule } from "@/lib/desk";
import { Segmented } from "./ui/Segmented";
import { EASE_OUT, SPRING } from "./ui/motion";

const SERIES: Record<Rule, "biggest" | "scalpel" | "signrule" | "fcfs"> = { biggest: "biggest", model: "scalpel", signs: "signrule", fcfs: "fcfs" };
const WHY: Record<Rule, string> = {
  biggest: "Act on the account holding the most traced scam money first. Simple, explainable, and in our tests as good as anything else.",
  model: "Let the mule-score model (17 clues) rank accounts by money likely to be lost per hour. It also gives 3 plain reasons per account.",
  signs: "Act first on accounts with 2 or more warning signs, such as a new SIM or a changed phone number.",
  fcfs: "Work through requests in the order they arrived.",
};

/** The officer picks how the inbox is sorted. The bars show what that choice achieved on 5 unseen test worlds. */
export function QueueSettings() {
  const { rule, setRule } = useDesk();
  const c = demo.order.byK["10"]!;
  const last = c.scalpel.x[c.scalpel.x.length - 1]!;
  const marks = [10, 50, 100, last];
  const queue = sortCases(demo.memo.cases, rule);

  return (
    <div className="card mt-6 p-5 sm:p-6 grid gap-6" data-testid="queue-settings">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="font-semibold text-[17px]">Sort my inbox by</p>
          <p className="text-[14.5px] muted mt-1">{WHY[rule]}</p>
        </div>
        <Segmented label="Sort my inbox by" value={rule} onChange={setRule} options={(Object.keys(RULE_LABEL) as Rule[]).map((r) => ({ value: r, label: RULE_LABEL[r], testid: `rule-${r}` }))} />
      </div>

      {rule === "biggest" ? (
        <p className="rounded-xl px-4 py-3 text-[14.5px]" style={{ background: "var(--good-tint)" }}><b style={{ color: "var(--good)" }}>Recommended.</b> This is the simple rule to beat, and our model did not beat it.</p>
      ) : (
        <p className="rounded-xl px-4 py-3 text-[14.5px]" style={{ background: "var(--warn-tint)" }}>
          <b style={{ color: "var(--warn)" }}>Not the recommended order.</b> Biggest amount first did as well or better in our tests.{" "}
          <button type="button" className="link font-semibold" onClick={() => setRule("biggest")} data-testid="use-recommended">Use the recommended order</button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="font-semibold">What this order achieved</p>
          <p className="text-[13px] muted">Share of the best possible rescue, average of 5 unseen test worlds, 10 accounts an hour. <span className="tag">known only afterwards</span></p>
          <ul className="mt-3 grid gap-3">
            {marks.map((a) => {
              const v = atAction(c, SERIES[rule], a);
              const best = atAction(c, "biggest", a);
              return (
                <li key={a}>
                  <div className="flex items-baseline justify-between text-[13.5px]">
                    <span className="muted">After {a === last ? `all ${a}` : a} accounts</span>
                    <span><b className="mono">{pct(v)}</b>{rule !== "biggest" && <span className="muted mono"> vs {pct(best)}</span>}</span>
                  </div>
                  <div className="relative mt-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                    <m.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: "var(--accent)" }} initial={false} animate={{ width: `${v}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
                    {rule !== "biggest" && <span className="absolute inset-y-0 w-0.5" style={{ left: `${best}%`, background: "var(--fg)" }} title="Biggest amount first" />}
                  </div>
                </li>
              );
            })}
          </ul>
          {rule !== "biggest" && <p className="text-[12.5px] muted mt-2">The thin dark mark is biggest amount first.</p>}
        </div>
        <div>
          <p className="font-semibold">Your inbox in this order</p>
          <ol className="mt-3 grid gap-2" data-testid="queue-preview">
            {queue.map((x, i) => (
              <m.li key={x.account} layout transition={SPRING}>
                <Link href={`/?m=${x.account}`} className="card-flat lift flex items-center gap-3 px-4 py-3">
                  <span className="mono text-[13px] w-6 h-6 rounded-md grid place-items-center" style={{ background: "var(--accent-tint)", color: "var(--accent-ink)" }}>{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{x.type === "CURRENT" ? "Shop's current account" : "Savings account"} <span className="mono muted text-[13px]">{maskAccount(x.account)}</span></span>
                    <span className="block text-[12.5px] muted">traced <span className="mono">{formatRupees(x.tracedPaise)}</span> · mule score <span className="mono">{x.muleScore.toFixed(2)}</span> · {x.signals.length} warning signs</span>
                  </span>
                </Link>
              </m.li>
            ))}
          </ol>
          <p className="text-[12.5px] muted mt-2">Only 2 demo cases are fully traced, so the queue is short. The order rule is what matters.</p>
        </div>
      </div>
    </div>
  );
}
