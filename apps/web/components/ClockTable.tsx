import type { MemoCase } from "@/lib/demo-schema";
import { istDate } from "@/lib/rules";

const EXPIRY: Record<string, string> = {
  OVERDUE: "flag as overdue", ESCALATE: "escalate", DECIDE: "bank must review and decide", AUTO_RELEASE: "release automatically", CONVERT: "hand over to another regime",
};

const STATE: Record<string, string> = {
  NOT_STARTED: "starts when triggered", RUNNING: "running", ALERT: "due soon", SATISFIED: "done in time",
  SATISFIED_LATE: "done late", EXPIRED: "missed", NOT_APPLICABLE: "does not apply",
};
const START: Record<string, string> = { HOLD_PLACED: "hold placed", REPLY_RECEIVED: "holder's grievance", GRM_UPLOADED: "grievance uploaded", REFERRED_TO_LEA: "referred to police", NOTICE_SENT: "notice sent" };

export function ClockTable({ m }: { m: MemoCase }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table text-sm" data-testid="clocks">
        <thead><tr><th>Deadline</th><th className="pr-2">Days</th><th className="pr-2">Starts at</th><th className="pr-2">Due</th><th className="pr-2">If missed</th><th className="pr-2">Now</th><th>Source</th></tr></thead>
        <tbody>
          {m.clocks.map((c) => (
            <tr key={c.id}>
              <td className="py-1 pr-2">{c.label}</td><td className="pr-2">{c.days}</td><td className="pr-2">{START[c.startsOn] ?? c.startsOn}</td><td className="pr-2">{istDate(c.dueAt)}</td>
              <td className="pr-2">{EXPIRY[c.onExpiry] ?? c.onExpiry}</td>
              <td className="pr-2" data-testid={`clock-${c.id}`}>{STATE[c.state] ?? c.state}</td>
              <td>{c.status === "assumed" ? <span className="tag">our reading, assumed</span> : null}{c.unverified.length ? <span className="tag ml-1">source being checked</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
