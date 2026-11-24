import { demo } from "@/lib/data";
import { Timeline30d } from "@/components/Timeline30d";
import { HeadlineCards } from "@/components/HeadlineCards";
import { Provenance } from "@/components/Provenance";
import { TradeOff } from "@/components/TradeOff";
import { FullData, PageHead } from "@/components/ui/Explain";
import { Replay } from "./Replay";
import { formatRupees } from "@/lib/money";

export const metadata = { title: "72-hour replay · Scalpel" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ReplayPage() {
  const total = demo.headline.none.victimMoneyPaise;
  const a = demo.headlineV2.axe, s = demo.headlineV2.scalpel;
  return (
    <>
      <PageHead eyebrow="Choose the bank's hold policy" title="72-hour replay"
        purpose={<>Replay one invented scam month and see, hour by hour, how much victim money each policy saves and who it hurts.</>}
        how={<>Pick a policy, then press play. <b>Whole freeze</b> is what many banks do today.</>} />
      <Replay replay={demo.replay} total={total} />
      <section className="mt-12" data-testid="v2-tradeoff">
        <h2 className="title text-[24px] sm:text-[28px] max-w-3xl">The same choice on 5 bigger test worlds</h2>
        <p className="text-[15px] mt-3 max-w-3xl leading-relaxed">
          This demo month is small: most unreported money sits in accounts no complaint leads to, so a whole freeze looks only a little better here.
          Across the 5 bigger test worlds, a whole freeze reaches <b>{pct(1 - a.victimMoneyMissedPaise / a.victimMoneyPaise)}</b> of victim money against
          {" "}<b>{pct(1 - s.victimMoneyMissedPaise / s.victimMoneyPaise)}</b> for exact holds, because it also catches money from victims who have not complained yet.
          The price: <b className="mono">{formatRupees(a.innocentHeldPaise)}</b> of innocent money locked and <b>{a.peopleWronglyRestricted.toLocaleString("en-IN")}</b> people wrongly restricted,
          against {formatRupees(s.innocentHeldPaise)} and {s.peopleWronglyRestricted} for exact holds. <span className="tag">known only afterwards</span>
        </p>
        <div className="mt-6"><TradeOff axe={a} exact={s} /></div>
        <p className="text-[13.5px] muted mt-4 max-w-3xl">The law already points to exact holds (police-requested liens limited to the reported amount; RBI&apos;s draft keeps whole-account freezes as a last resort). Scalpel keeps a whole freeze possible only as an officer proposal a supervisor approves.</p>
      </section>
      <FullData title="All four policies in the demo month, with the working">
        <HeadlineCards headline={demo.headline} />
      </FullData>
      <FullData title="The 30 days before the bank decides">
        <Timeline30d days={demo.replay.timeline} />
      </FullData>
      <Provenance />
    </>
  );
}
