"use client";
import * as m from "motion/react-m";
import { formatRupees } from "@/lib/money";
import { EASE_OUT } from "./ui/motion";

/** The whole idea in one picture: the same account, held two ways. Bar lengths are exact; only their growth is animated. */
export function HoldBars({ heldPaise, balancePaise, compact }: { heldPaise: number; balancePaise: number; compact?: boolean }) {
  const share = heldPaise / balancePaise;
  return (
    <div className={`grid ${compact ? "gap-3" : "gap-5"}`} data-testid="hold-bars">
      <Row label="Scalpel holds" amount={formatRupees(heldPaise)} note={`${formatRupees(balancePaise - heldPaise)} stays usable`} color="var(--hold)" fill="var(--hold-fill)" share={share} delay={0.25} compact={compact} />
      <Row label="A whole-account freeze locks" amount={formatRupees(balancePaise)} note="nothing usable until it is lifted" color="var(--freeze)" fill="var(--freeze)" share={1} delay={0.1} compact={compact} />
      {!compact && <p className="text-[12.5px] muted">Same account, drawn to scale. Traced scam money is {(share * 100).toFixed(1)}% of the balance.</p>}
    </div>
  );
}

function Row({ label, amount, note, color, fill, share, delay, compact }: { label: string; amount: string; note: string; color: string; fill: string; share: number; delay: number; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{label}</span>
        {!compact && <span className="text-sm muted">{note}</span>}
      </div>
      <p className={`num font-semibold tracking-tight leading-tight mt-0.5 ${compact ? "text-[20px]" : "text-[26px] sm:text-[30px]"}`} style={{ color }}>{amount}</p>
      <div className={`mt-2 ${compact ? "h-2.5" : "h-3.5"} rounded-full overflow-hidden`} style={{ background: "var(--bg-2)" }} role="img" aria-label={`${label} ${amount}`}>
        <m.div className="h-full rounded-full" style={{ background: fill, width: `max(${(share * 100).toFixed(3)}%, 6px)`, transformOrigin: "left" }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease: EASE_OUT, delay }} />
      </div>
    </div>
  );
}
