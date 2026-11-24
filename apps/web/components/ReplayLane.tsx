"use client";
import * as m from "motion/react-m";
import { formatRupees } from "@/lib/money";
import { LANE_LABEL, LANE_NOTE, valuesAt } from "@/lib/replay";
import type { Lane } from "@/lib/demo-schema";
import { MathDrawer } from "./MathDrawer";
import { SPRING } from "./ui/motion";

type LaneKey = keyof typeof LANE_LABEL;
const LANE_COLOR: Record<LaneKey, string> = { none: "var(--s-neutral)", axe: "var(--freeze)", biggest: "var(--s3)", scalpel: "var(--accent)" };

export function ReplayLane({ id, lane, hour, total }: { id: LaneKey; lane: Lane; hour: number; total: number }) {
  const v = valuesAt(lane, hour);
  const b = lane.buckets;
  const share = total > 0 ? v.secured / total : 0;
  return (
    <section className="card p-5 flex flex-col" data-testid={`lane-${id}`} style={id === "scalpel" ? { borderColor: "var(--accent-line)" } : undefined}>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: LANE_COLOR[id] }} aria-hidden />
        <h3 className="font-semibold">{LANE_LABEL[id]}</h3>
      </div>
      <p className="text-[13px] muted mt-1 min-h-10">{LANE_NOTE[id]}</p>
      <div className="mt-3">
        <p className="text-[12.5px] muted">Victim money secured</p>
        <p className="num text-[24px] font-semibold leading-tight" data-testid="secured">{formatRupees(v.secured)}</p>
        <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--line)" }} aria-hidden>
          <m.div className="h-full rounded-full" style={{ background: LANE_COLOR[id] }} animate={{ width: `${share * 100}%` }} initial={false} transition={SPRING} />
        </div>
        <p className="text-[11.5px] muted mt-1 num">{Math.round(share * 100)}% of all victim money</p>
      </div>
      <dl className="mt-4 space-y-2 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
        <Row label="Victim money gone for good" value={formatRupees(v.gone)} testid="gone" />
        <Row label="Innocent money locked" value={formatRupees(v.innocentLocked)} testid="innocent" warn={v.innocentLocked > 0} />
        <Row label="People wrongly restricted" value={String(v.people)} testid="people" warn={v.people > 0} />
        <Row label="Of them, shopkeepers" value={String(v.shops)} testid="shops" warn={v.shops > 0} />
      </dl>
      <div className="mt-auto">
        <MathDrawer
          formula="Each hour the officer acts on 10 accounts. Secured = for each account acted on, the smaller of its hold and the victim money still in it at that hour. Mule money leaves at 15% an hour; other money 5× slower. Innocent = money held beyond the victim money in each account."
          inputs={[
            ["where all victim money ended up by hour 72", ""],
            ["secured", formatRupees(b.securedPaise)],
            ["not yet complained about, in an account this lane held (only a whole freeze reaches it)", formatRupees(b.neverComplainedHeldAccountPaise)],
            ["not yet complained about, in an account no complaint leads to (nobody can reach it)", formatRupees(b.neverComplainedNoTracePaise)],
            ["reported, but left before the hold", formatRupees(b.reportedGoneBeforeHoldPaise)],
            ["reported, but account not reached or not traced", formatRupees(b.reportedNotReachedOrNotTracedPaise)],
            ["total (adds up exactly)", formatRupees(total)],
          ]}
        />
      </div>
    </section>
  );
}

function Row({ label, value, testid, warn }: { label: string; value: string; testid: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[13px] muted">{label}</dt>
      <dd className="font-semibold num" data-testid={testid} style={warn ? { color: "var(--freeze)" } : undefined}>{value}</dd>
    </div>
  );
}
