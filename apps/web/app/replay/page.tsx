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
        <p className="text-[15px] mt-3 max-w-3xl leading-relaxed muted">
          A whole freeze catches more victim money, but at a price: <b style={{ color: "var(--fg)" }}>{a.peopleWronglyRestricted.toLocaleString("en-IN")}</b> people wrongly restricted. <span className="tag">known only afterwards</span>
        </p>
        <div className="mt-6"><TradeOff axe={a} exact={s} /></div>
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
