import Link from "next/link";
import { demo } from "@/lib/data";
import { formatRupees } from "@/lib/money";
import { HeadlineCards } from "@/components/HeadlineCards";
import { Provenance } from "@/components/Provenance";
import { POLICY_KEYS } from "@/lib/demo-schema";
import { POLICY_LABEL, ratioText } from "@/lib/policies";

export default function Home() {
  const w = demo.world;
  const shop = demo.memo.cases.find((c) => c.account === "D00191") ?? demo.memo.cases[0]!;
  return (
    <>
      <h1 className="text-2xl sm:text-3xl font-semibold">Every hold carries the record a court asks for.</h1>
      <Link href={`/memo?a=${shop.account}`} className="block mt-3 card p-4 hover:underline" data-testid="lead-hold">
        <span className="text-xl font-semibold">Hold {formatRupees(shop.heldPaise)} of {formatRupees(shop.balancePaise)}.</span>{" "}
        <span>The other {formatRupees(shop.balancePaise - shop.heldPaise)} stays usable.</span>
        <span className="block text-sm muted mt-1">A business current account that received a little scam money: how much, under which rule, until when, and who approved it. Open the memo →</span>
      </Link>
      <p className="mt-2 max-w-3xl muted">
        When fraud is reported, banks often freeze whole accounts. Innocent people lose access to far more than the disputed money.
        Scalpel holds only the traced amount, checks every hold against the rules, and shows its working.
        It holds the same money as a plain exact hold; what it adds is the legal checks, the deadlines and the proof.
      </p>
      <p className="mt-2 text-sm muted">
        Demo world: {w.accounts} invented accounts, {w.victims} victims, {w.complaints} complaints ({Math.round(w.reportRate * 100)}% of victims reported).
      </p>

      <h2 className="mt-6 mb-3 text-lg font-semibold">Two numbers, always together</h2>
      <HeadlineCards headline={demo.headline} />


      <section className="mt-6 card p-4">
        <h2 className="font-semibold">On the 5 unseen test worlds (about 3,000 accounts each)</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left muted"><th className="py-1 pr-3">Policy</th><th className="pr-3">Held ÷ reported</th><th className="pr-3">Held ÷ all victim money</th><th className="pr-3">Victim money missed</th><th className="pr-3">Innocent money locked</th><th>People wrongly restricted</th></tr></thead>
            <tbody>
              {POLICY_KEYS.map((k) => {
                const h = demo.headlineV2[k];
                return (
                  <tr key={k} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="py-1 pr-3">{POLICY_LABEL[k]}</td><td className="pr-3">{ratioText(h.reportedRatio)}</td><td className="pr-3">{ratioText(h.freezeRatio)}</td>
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
