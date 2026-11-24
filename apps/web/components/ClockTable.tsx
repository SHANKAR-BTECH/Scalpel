import type { MemoCase } from "@/lib/demo-schema";
import { istDate } from "@/lib/rules";

const EXPIRY: Record<string, string> = {
  OVERDUE: "flag as overdue", ESCALATE: "escalate", DECIDE: "bank must review and decide", AUTO_RELEASE: "release automatically", CONVERT: "hand over to another regime",
};

export function ClockTable({ m }: { m: MemoCase }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="clocks">
        <thead><tr className="text-left muted"><th className="py-1 pr-2">Deadline</th><th className="pr-2">Days</th><th className="pr-2">Due</th><th className="pr-2">If missed</th><th>Status</th></tr></thead>
        <tbody>
          {m.clocks.map((c) => (
            <tr key={c.id} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="py-1 pr-2">{c.label}</td><td className="pr-2">{c.days}</td><td className="pr-2">{istDate(c.dueAt)}</td>
              <td className="pr-2">{EXPIRY[c.onExpiry] ?? c.onExpiry}</td>
              <td>{c.status === "assumed" ? <span className="tag">our reading, assumed</span> : null}{c.unverified.length ? <span className="tag ml-1">source being checked</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
