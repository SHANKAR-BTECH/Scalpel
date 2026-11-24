import { formatRupees } from "@/lib/money";
import { LANE_LABEL, LANE_NOTE, valuesAt } from "@/lib/replay";
import type { Lane } from "@/lib/demo-schema";
import { MathDrawer } from "./MathDrawer";

type LaneKey = keyof typeof LANE_LABEL;

export function ReplayLane({ id, lane, hour, total }: { id: LaneKey; lane: Lane; hour: number; total: number }) {
  const v = valuesAt(lane, hour);
  const b = lane.buckets;
  return (
    <section className="card p-4" data-testid={`lane-${id}`}>
      <h3 className="font-semibold">{LANE_LABEL[id]}</h3>
      <p className="text-xs muted min-h-8">{LANE_NOTE[id]}</p>
      <dl className="mt-2 space-y-2">
        <Row label="Victim money secured" value={formatRupees(v.secured)} testid="secured" />
        <Row label="Victim money gone for good" value={formatRupees(v.gone)} testid="gone" />
        <Row label="Innocent money locked" value={formatRupees(v.innocentLocked)} testid="innocent" />
        <Row label="People wrongly restricted" value={String(v.people)} testid="people" />
        <Row label="Of them, shopkeepers" value={String(v.shops)} testid="shops" />
      </dl>
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
    </section>
  );
}

function Row({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm muted">{label}</dt>
      <dd className="font-semibold tabular-nums" data-testid={testid}>{value}</dd>
    </div>
  );
}
