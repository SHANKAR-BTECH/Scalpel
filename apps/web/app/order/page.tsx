import { demo } from "@/lib/data";
import { ORDER_LABEL, pct } from "@/lib/order";
import { OrderChart } from "@/components/OrderChart";
import { WorstTable } from "@/components/WorstTable";
import { Provenance } from "@/components/Provenance";

export const metadata = { title: "Who first? · Scalpel" };

const V3_ROWS = ["ceiling", "scalpel", "biggest", "biggestcase", "signrule", "fcfs"] as const;

export default function OrderPage() {
  const o = demo.order;
  const v3 = o.v3;
  return (
    <>
      <h1 className="text-2xl font-semibold">Who first?</h1>
      <p className="mt-1 muted max-w-3xl">
        Every order below holds exactly the same amounts. The only difference is which account the officer acts on first, at 10 accounts an hour unless you switch K.
        The mule-score model sorts the list and gives reasons; it never sets the amount.
      </p>
      <p className="mt-2 max-w-3xl font-medium" data-testid="caption">{o.caption[0]}</p>
      <p className="text-xs muted">{o.source}.</p>
      <p className="mt-2 max-w-3xl text-sm" data-testid="ceiling-v2">
        Why the model can&apos;t pull ahead here: even <b>perfect knowledge</b> of who is a mule, fed into the same formula, reaches only {pct(o.ceilingV2.ceiling)} against
        {" "}{pct(o.ceilingV2.biggest)} for biggest amount first. In these worlds the amount already gives away who the mules are, so better detection cannot improve the order.
        The model&apos;s real jobs are the 3 plain reasons and the whole-freeze condition (R2).
      </p>
      <div className="mt-4"><OrderChart byK={o.byK} /></div>

      <section className="card p-4 mt-6" data-testid="v3">
        <h2 className="font-semibold">The harder test: split payments, locked in advance</h2>
        <p className="text-sm mt-1">
          Mules pass money on in pieces under ₹10,000 across 3 to 5 accounts, so amounts mislead. The world settings, a stronger simple rule
          (&ldquo;biggest case first&rdquo;) and the pass mark (+2 points over both simple rules) were locked before any result was seen.
          The mule-score model was not retrained.
        </p>
        {v3 ? (
          <>
            <p className="mt-2 font-medium" data-testid="v3-verdict">{v3.sentence}</p>
            <div className="overflow-x-auto mt-2">
              <table className="text-sm" data-testid="v3-table">
                <thead><tr className="text-left"><th className="pr-4">Order (high noise, pooled over 3 worlds)</th><th className="pr-4">K=5</th><th className="pr-4">K=10</th><th className="pr-4">K=20</th></tr></thead>
                <tbody>
                  {V3_ROWS.map((n) => (
                    <tr key={n} className={n === "ceiling" ? "italic" : undefined}><td className="pr-4">{ORDER_LABEL[n]}</td>{["5", "10", "20"].map((k) => <td key={k} className="pr-4 tabular-nums">{pct(v3.high[k]![n]![0]!)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs muted mt-2">
              Our reading of why &ldquo;biggest case first&rdquo; did so badly: when a case is split over many accounts, it sends the officer to many small pieces of one big case before a large piece elsewhere.
              The &ldquo;mixed credit&rdquo; pieces turned out to draw on money the mule kept back, which is mostly victim money (a generator bug found after grading; the lock and result are unchanged).
              Lock file: <span className="font-mono">{v3.lock}</span>. <span className="tag">known only afterwards</span>
            </p>
          </>
        ) : <p className="mt-2 text-sm">Not run yet.</p>}
      </section>

      <div className="mt-6"><WorstTable rows={demo.worst} /></div>
      <Provenance />
    </>
  );
}
