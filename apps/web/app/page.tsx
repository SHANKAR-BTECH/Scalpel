import Link from "next/link";
import { demo } from "@/lib/data";
import { formatRupees } from "@/lib/money";
import { HeadlineCards } from "@/components/HeadlineCards";
import { TradeOff } from "@/components/TradeOff";
import { Provenance } from "@/components/Provenance";
import { POLICY_KEYS } from "@/lib/demo-schema";
import { POLICY_LABEL, ratioText } from "@/lib/policies";

export default function Home() {
  const w = demo.world;
  return (
    <>
      <h1 className="text-2xl sm:text-3xl font-semibold">Hold the right amount, legally, and show the proof.</h1>
      <p className="mt-2 max-w-3xl muted">
        When fraud is reported, banks often freeze whole accounts. Innocent people lose access to far more than the disputed money.
        Scalpel holds only the traced amount, checks every hold against the rules, and shows its working.
      </p>
      <p className="mt-2 text-sm muted">
        Demo world: {w.accounts} invented accounts, {w.victims} victims, {w.complaints} complaints ({Math.round(w.reportRate * 100)}% of victims reported).
      </p>

      <h2 className="mt-6 mb-3 text-lg font-semibold">Two numbers, always together</h2>
      <HeadlineCards headline={demo.headline} />

      <div className="mt-6"><TradeOff headline={demo.headline} /></div>

      <section className="mt-6 card p-4">
        <h2 className="font-semibold">On the 5 unseen test worlds (about 3,000 accounts each)</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left muted"><th className="py-1 pr-3">Policy</th><th className="pr-3">Freeze Ratio</th><th className="pr-3">Victim money missed</th><th className="pr-3">Innocent money locked</th><th>People wrongly restricted</th></tr></thead>
            <tbody>
              {POLICY_KEYS.map((k) => {
                const h = demo.headlineV2[k];
                return (
                  <tr key={k} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="py-1 pr-3">{POLICY_LABEL[k]}</td><td className="pr-3">{ratioText(h.freezeRatio)}</td>
                    <td className="pr-3">{formatRupees(h.victimMoneyMissedPaise)} of {formatRupees(h.victimMoneyPaise)}</td>
                    <td className="pr-3">{formatRupees(h.innocentHeldPaise)}</td><td>{h.peopleWronglyRestricted}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="no-print mt-6 grid gap-3 sm:grid-cols-3">
        <Link href="/replay" className="card p-4 hover:underline">▶ Watch the same 30 days, four ways</Link>
        <Link href="/memo" className="card p-4 hover:underline">📄 Read a hold memo, rule by rule</Link>
        <Link href="/order" className="card p-4 hover:underline">⏱ Who should the officer act on first?</Link>
      </nav>
      <Provenance />
    </>
  );
}
