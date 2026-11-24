import { demo } from "@/lib/data";
import { Timeline30d } from "@/components/Timeline30d";
import { Provenance } from "@/components/Provenance";
import { Replay } from "./Replay";

export const metadata = { title: "Same 30 days, four ways · Scalpel" };

export default function ReplayPage() {
  const total = demo.headline.none.victimMoneyPaise;
  return (
    <>
      <h1 className="text-2xl font-semibold">Same 30 days, four ways</h1>
      <p className="mt-1 muted max-w-3xl">One invented scam month in one demo bank. The bank decides at the end of day 30. Then we play the next 72 hours four times, changing one thing at a time.</p>
      <div className="mt-4"><Timeline30d days={demo.replay.timeline} /></div>
      <Replay replay={demo.replay} total={total} />
      <Provenance />
    </>
  );
}
