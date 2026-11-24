import { demo } from "@/lib/data";
import { ORDER_LABEL, pct } from "@/lib/order";
import { OrderChart } from "@/components/OrderChart";
import { WorstTable } from "@/components/WorstTable";
import { Provenance } from "@/components/Provenance";
import { Explain, FullData, PageHead } from "@/components/ui/Explain";
import { Reveal } from "@/components/ui/Reveal";

export const metadata = { title: "Who first? · Scalpel" };

const V3_ROWS = ["ceiling", "scalpel", "biggest", "biggestcase", "signrule", "fcfs"] as const;

export default function OrderPage() {
  const o = demo.order;
  const v3 = o.v3;
  return (
    <>
      <PageHead eyebrow="Who first?" title="Which account should the officer act on first?"
        lede="Every order below holds exactly the same amounts. The only difference is which account the officer acts on first, at 10 accounts an hour unless you switch K. The mule-score model sorts the list and gives reasons; it never sets the amount." />
      <Explain
        takeaway={<>The mule-score model&apos;s order is about as good as the simple rule to beat, <b>biggest amount first</b>, but not better. In the test we locked in advance it missed the pass mark, so we report it as <b>not earned</b>.</>}
        howToRead={<>Higher is better: each line shows how much of the best possible rescue an order reaches as the officer works down the list. Switch K to change how many accounts an officer can handle per hour. The stamped box below is the locked test.</>}
      />

      <Reveal as="section" className="mt-10">
        <div className="card p-6 sm:p-7" data-testid="v3" style={{ borderTop: "4px solid var(--warn)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">The harder test · locked in advance</p>
              <h2 className="display text-[26px] sm:text-[30px] mt-2 max-w-2xl">Split payments: the model did not earn its place.</h2>
            </div>
            {v3 && <span className="stamp mt-2">{v3.verdict}</span>}
          </div>
          <p className="text-[15px] mt-3 max-w-3xl leading-relaxed">
            Mules pass money on in pieces under ₹10,000 across 3 to 5 accounts, so amounts mislead. The world settings, a stronger simple rule
            (&ldquo;biggest case first&rdquo;) and the pass mark (+2 points over both simple rules) were locked before any result was seen.
            The mule-score model was not retrained.
          </p>
          {v3 ? (
            <>
              <p className="mt-4 font-medium text-[15px] leading-relaxed rounded-xl p-4" style={{ background: "var(--warn-tint)" }} data-testid="v3-verdict">{v3.sentence}</p>
              <div className="overflow-x-auto mt-4">
                <table className="data-table" data-testid="v3-table">
                  <thead><tr><th>Order (high noise, pooled over 3 worlds)</th><th>K=5</th><th>K=10</th><th>K=20</th></tr></thead>
                  <tbody>
                    {V3_ROWS.map((n) => (
                      <tr key={n} className={n === "ceiling" ? "italic muted" : undefined} style={n === "scalpel" ? { background: "var(--accent-tint)" } : undefined}>
                        <td className="font-medium">{ORDER_LABEL[n]}</td>{["5", "10", "20"].map((k) => <td key={k} className="num">{pct(v3.high[k]![n]![0]!)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs muted mt-3 leading-relaxed">
                Our reading of why &ldquo;biggest case first&rdquo; did so badly: when a case is split over many accounts, it sends the officer to many small pieces of one big case before a large piece elsewhere.
                The &ldquo;mixed credit&rdquo; pieces turned out to draw on money the mule kept back, which is mostly victim money (a generator bug found after grading; the lock and result are unchanged).
                Lock file: <span className="font-mono">{v3.lock}</span>. <span className="tag">known only afterwards</span>
              </p>
            </>
          ) : <p className="mt-2 text-sm">Not run yet.</p>}
        </div>
      </Reveal>

      <Reveal as="section" className="mt-14">
        <p className="eyebrow">The first test · 5 unseen worlds</p>
        <h2 className="display text-[26px] sm:text-[30px] mt-2 max-w-3xl">Money secured as the officer works down the list.</h2>
        <p className="mt-3 max-w-3xl text-[15px] font-medium leading-relaxed" data-testid="caption">{o.caption[0]}</p>
        <p className="text-xs muted mt-1">{o.source}.</p>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed" data-testid="ceiling-v2">
          Why the model can&apos;t pull ahead here: even <b>perfect knowledge</b> of who is a mule, fed into the same formula, reaches only {pct(o.ceilingV2.ceiling)} against
          {" "}{pct(o.ceilingV2.biggest)} for biggest amount first. In these worlds the amount already gives away who the mules are, so better detection cannot improve the order.
          The model&apos;s real jobs are the 3 plain reasons and the whole-freeze condition (R2).
        </p>
        <div className="mt-6"><OrderChart byK={o.byK} /></div>
      </Reveal>

      <FullData title="Where the mule-score model gets it wrong: its 5 costliest mistakes" open>
        <WorstTable rows={demo.worst} />
      </FullData>
      <Provenance />
    </>
  );
}
