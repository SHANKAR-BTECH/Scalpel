import { formatRupees } from "@/lib/money";
import { POLICY_KEYS, type DemoData } from "@/lib/demo-schema";
import { POLICY_LABEL, POLICY_NOTE, ratioText } from "@/lib/policies";
import { MathDrawer } from "./MathDrawer";

/** Freeze Ratio is never shown alone: victim money missed always sits next to it.
 * The lead ratio is held ÷ money REPORTED so far (what a bank can know); held ÷ real victim money is shown second. */
export function HeadlineCards({ headline }: { headline: DemoData["headline"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {POLICY_KEYS.map((k) => {
        const h = headline[k];
        return (
          <section key={k} className="card p-4" data-testid={`card-${k}`}>
            <h3 className="font-semibold">{POLICY_LABEL[k]}</h3>
            <p className="text-xs muted mt-1 min-h-8">{POLICY_NOTE[k]}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-xs muted">Held ÷ reported money</dt>
                <dd className="text-xl font-semibold" data-testid="ratio">{ratioText(h.reportedRatio)}</dd>
                <dd className="text-xs muted" data-testid="real-ratio">{ratioText(h.freezeRatio)} of all victim money</dd>
              </div>
              <div>
                <dt className="text-xs muted">Victim money missed</dt>
                <dd className="text-xl font-semibold" data-testid="missed">{formatRupees(h.victimMoneyMissedPaise)}</dd>
              </div>
              <div>
                <dt className="text-xs muted">Innocent money locked</dt>
                <dd className="font-semibold">{formatRupees(h.innocentHeldPaise)}</dd>
              </div>
              <div>
                <dt className="text-xs muted">People wrongly restricted</dt>
                <dd className="font-semibold">{h.peopleWronglyRestricted}</dd>
              </div>
            </dl>
            <MathDrawer
              formula="Freeze Ratio = money held ÷ victim money reported so far (exactly right is 1.00×). Second line: held ÷ all real victim money, including victims who have not complained yet. Missed = victim money not held. Innocent = money held beyond the victim money in each account."
              inputs={[
                ["money held", formatRupees(h.heldPaise)],
                ["victim money traced from complaints so far", formatRupees(h.reportedMoneyPaise)],
                ["real victim money (incl. victims who never complained)", formatRupees(h.victimMoneyPaise)],
                ["accounts held", String(h.accountsHeld)],
              ]}
            />
          </section>
        );
      })}
    </div>
  );
}
