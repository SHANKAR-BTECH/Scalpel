import { demo } from "@/lib/data";
import { Timeline30d } from "@/components/Timeline30d";
import { Provenance } from "@/components/Provenance";
import { Replay } from "./Replay";
import { formatRupees } from "@/lib/money";

export const metadata = { title: "Same 30 days, four ways · Scalpel" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ReplayPage() {
  const total = demo.headline.none.victimMoneyPaise;
  const a = demo.headlineV2.axe, s = demo.headlineV2.scalpel;
  return (
    <>
      <h1 className="text-2xl font-semibold">Same 30 days, four ways</h1>
      <p className="mt-1 muted max-w-3xl">One invented scam month in one demo bank. The bank decides at the end of day 30. Then we play the next 72 hours four times, changing one thing at a time.</p>
      <div className="mt-4"><Timeline30d days={demo.replay.timeline} /></div>
      <Replay replay={demo.replay} total={total} />
      <section className="mt-6 card p-4" data-testid="v2-tradeoff">
        <h2 className="font-semibold">The honest trade-off, across the 5 unseen test worlds</h2>
        <p className="text-sm mt-1">
          This demo month is small: most unreported money sits in accounts no complaint leads to, so a whole freeze looks only a little better here.
          Across the 5 bigger test worlds, a whole freeze reaches <b>{pct(1 - a.victimMoneyMissedPaise / a.victimMoneyPaise)}</b> of victim money against
          {" "}<b>{pct(1 - s.victimMoneyMissedPaise / s.victimMoneyPaise)}</b> for exact holds, because it also catches money from victims who have not complained yet.
          The price: <b>{formatRupees(a.innocentHeldPaise)}</b> of innocent money locked and <b>{a.peopleWronglyRestricted.toLocaleString("en-IN")}</b> people wrongly restricted,
          against {formatRupees(s.innocentHeldPaise)} and {s.peopleWronglyRestricted} for exact holds. <span className="tag">known only afterwards</span>
        </p>
        <p className="text-xs muted mt-1">The law already points to exact holds (police-requested liens limited to the reported amount; RBI's draft keeps whole-account freezes as a last resort). Scalpel keeps a whole freeze possible only as an officer proposal a supervisor approves.</p>
      </section>
      <Provenance />
    </>
  );
}
