import type { DemoData } from "@/lib/demo-schema";
import { formatRupees } from "@/lib/money";

/** The 5 costliest mistakes of the mule-score model on unseen worlds: wrong score x money involved. */
export function WorstTable({ rows }: { rows: DemoData["worst"] }) {
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Where the mule-score model gets it wrong</h2>
      <p className="text-xs muted">The 5 costliest mistakes on the unseen worlds, with the reasons it gave. <span className="tag">known only afterwards</span></p>
      <div className="overflow-x-auto mt-2">
        <table className="text-sm w-full" data-testid="worst">
          <thead><tr className="text-left"><th className="pr-3">Account</th><th className="pr-3">Really</th><th className="pr-3">Score</th><th className="pr-3">Traced</th><th>Reasons it gave</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.world}-${r.account}`} className="align-top border-t" style={{ borderColor: "var(--line)" }}>
                <td className="pr-3 font-mono text-xs">{r.account}<div className="muted">{r.world}</div></td>
                <td className="pr-3">{r.reallyMule ? "mule" : "innocent"}</td>
                <td className="pr-3 tabular-nums">{r.muleScore.toFixed(2)}</td>
                <td className="pr-3 tabular-nums">{formatRupees(r.tracedPaise)}</td>
                <td className="text-xs">{r.reasons.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs muted mt-2">Ordering by amount still puts big accounts early, so a low score on a big mule costs less than it looks. The hold size never depends on the score.</p>
    </section>
  );
}
