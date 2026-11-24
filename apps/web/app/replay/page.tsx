import { demo } from "@/lib/data";
import { Timeline30d } from "@/components/Timeline30d";
import { Provenance } from "@/components/Provenance";
import { TradeOff } from "@/components/TradeOff";
import { Explain, PageHead } from "@/components/ui/Explain";
import { Reveal } from "@/components/ui/Reveal";
import { Replay } from "./Replay";
import { formatRupees } from "@/lib/money";

export const metadata = { title: "Watch 72 hours · Scalpel" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ReplayPage() {
  const total = demo.headline.none.victimMoneyPaise;
  const a = demo.headlineV2.axe, s = demo.headlineV2.scalpel;
  return (
    <>
      <PageHead eyebrow="Same 30 days, four ways" title="Watch the 72 hours after a bank decides."
        lede="One invented scam month in one demo bank. At the end of day 30 the bank acts. We then play the next 72 hours four times, changing one thing at a time." />
      <Explain
        takeaway={<>Exact holds secure the same victim money as a careful bank does today, while locking <b>no innocent money</b>. A whole freeze secures a little more, but locks innocent people&apos;s money too.</>}
        howToRead={<>Press play or drag the slider through the hours. Each card is one approach. Compare <b>Whole freeze</b> with <b>Exact hold</b> to see the effect of hold size, and <b>Exact hold</b> with <b>Scalpel</b> to see the effect of order.</>}
      />
      <Reveal className="mt-8"><Timeline30d days={demo.replay.timeline} /></Reveal>
      <Replay replay={demo.replay} total={total} />
      <Reveal as="section" className="mt-14">
        <div data-testid="v2-tradeoff">
          <p className="eyebrow">The honest trade-off · 5 unseen test worlds</p>
          <h2 className="display text-[28px] sm:text-[34px] mt-3 max-w-3xl">Bigger reach, paid for by innocent people.</h2>
          <p className="text-[15px] mt-3 max-w-3xl leading-relaxed">
            This demo month is small: most unreported money sits in accounts no complaint leads to, so a whole freeze looks only a little better here.
            Across the 5 bigger test worlds, a whole freeze reaches <b>{pct(1 - a.victimMoneyMissedPaise / a.victimMoneyPaise)}</b> of victim money against
            {" "}<b>{pct(1 - s.victimMoneyMissedPaise / s.victimMoneyPaise)}</b> for exact holds, because it also catches money from victims who have not complained yet.
            The price: <b>{formatRupees(a.innocentHeldPaise)}</b> of innocent money locked and <b>{a.peopleWronglyRestricted.toLocaleString("en-IN")}</b> people wrongly restricted,
            against {formatRupees(s.innocentHeldPaise)} and {s.peopleWronglyRestricted} for exact holds. <span className="tag">known only afterwards</span>
          </p>
          <div className="mt-6"><TradeOff axe={a} exact={s} /></div>
          <p className="text-[13px] muted mt-4 max-w-3xl">The law already points to exact holds (police-requested liens limited to the reported amount; RBI&apos;s draft keeps whole-account freezes as a last resort). Scalpel keeps a whole freeze possible only as an officer proposal a supervisor approves.</p>
        </div>
      </Reveal>
      <Provenance />
    </>
  );
}
