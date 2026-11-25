import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { desk, type HoldRow } from "@/lib/server/desk";
import { model, holderName } from "@/lib/server/world";
import { ActForm } from "@/components/ActForm";
import { grievanceAction, proposeReleaseAction } from "@/app/actions";
import { day, inDays, inr } from "@/lib/format";
import { Paperclip } from "lucide-react";

const STATE: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "Running", cls: "chip-blue" }, ALERT: { label: "Due soon", cls: "chip-warn" }, EXPIRED: { label: "Overdue", cls: "chip-bad" },
  SATISFIED: { label: "Done", cls: "chip-good" }, SATISFIED_LATE: { label: "Done late", cls: "chip-warn" }, NOT_STARTED: { label: "Not started", cls: "chip-grey" }, NOT_APPLICABLE: { label: "—", cls: "chip-grey" },
};

function nextClock(h: HoldRow) {
  return h.clocks.filter((c) => c.dueAt && ["RUNNING", "ALERT", "EXPIRED"].includes(c.state)).sort((a, b) => a.dueAt! - b.dueAt!)[0];
}

export default async function Holds() {
  const u = await requireUser("officer", "supervisor", "auditor");
  const d = await desk();
  const m = model();
  const rows = [...d.holds].sort((a, b) => Number(a.hold.state === "RELEASED") - Number(b.hold.state === "RELEASED") || (nextClock(a)?.dueAt ?? Infinity) - (nextClock(b)?.dueAt ?? Infinity));
  const active = rows.filter((r) => r.hold.state === "ACTIVE");
  const overdue = active.filter((r) => r.clocks.some((c) => c.state === "EXPIRED")).length;
  const soon = active.filter((r) => r.clocks.some((c) => c.state === "ALERT")).length;
  return (
    <div>
      <h1 className="mt-1">{active.length} active {active.length === 1 ? "hold" : "holds"} · {inr(active.reduce((s, r) => s + r.hold.amount, 0))}</h1>
      <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
        <span className={`chip ${overdue ? "chip-bad" : "chip-good"}`} data-testid="overdue">{overdue} overdue</span>
        <span className={`chip ${soon ? "chip-warn" : "chip-grey"}`}>{soon} due soon</span>
        </div>
      <p className="mt-2 max-w-[820px] text-[13px] muted">Police holds follow the MHA SOP: the bank sends the holder&apos;s explanation to the police within 7 days, the police officer decides within 15, and the bank reviews at 90 days (a review, not an automatic release).</p>
      <div>
      </div>
      {rows.length === 0 && <p className="mt-6 sheet p-5 muted">No holds yet. The officer decides them on a case with the AI; the supervisor approves.</p>}
      <div className={`mt-5 overflow-x-auto ${rows.length === 0 ? "hidden" : ""}`}>
        <table className="table min-w-[860px]" data-testid="holds-table">
          <thead><tr><th>Hold</th><th>Account</th><th>Amount</th><th>Placed</th><th>Holder&apos;s explanation</th><th>Next deadline</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const v = m.accounts.get(r.hold.account)!;
              const nc = nextClock(r);
              const pending = d.pendingByAccount.get(r.hold.account);
              return (
                <tr key={r.hold.id} data-testid="hold-row">
                  <td><span className="mono">{r.ref}</span><br /><Link className="text-[12px] link" href={`/case/${r.caseId}#acct-${r.hold.account}`}>{r.caseId}</Link></td>
                  <td>{holderName(v.a)}<br /><span className="mono text-[12px] muted">{v.a.id}</span></td>
                  <td className="money">{inr(r.hold.amount)}</td>
                  <td>{day(r.hold.events[0]!.at)}</td>
                  <td className="max-w-[260px] text-[13px]">{r.reply ? <>&ldquo;{r.reply.text.slice(0, 90)}{r.reply.text.length > 90 ? "…" : ""}&rdquo;{r.reply.fileName && <span className="mt-0.5 flex items-center gap-1 muted"><Paperclip size={13} aria-hidden /> {r.reply.fileName}</span>}{r.grmUploaded && <span className="chip chip-good mt-1">Sent to police</span>}</> : <span className="muted">None yet</span>}</td>
                  <td>{r.hold.state === "RELEASED" ? <span className="chip chip-grey">Released</span> : nc ? <><span className={`chip ${STATE[nc.state]!.cls}`}>{STATE[nc.state]!.label}</span><span className="mt-1 block text-[12.5px]">{nc.clock.label}</span><span className="text-[12px] muted">{day(nc.dueAt!)} ({inDays(nc.dueAt!, d.now)})</span></> : <span className="muted">—</span>}</td>
                  <td className="space-y-2">
                    {u.role === "officer" && r.hold.state === "ACTIVE" && r.reply && !r.grmUploaded && <ActForm action={grievanceAction} hidden={{ hold: r.hold.id }} label="Send explanation to police" size="sm" testid="grm" />}
                    {u.role === "officer" && r.hold.state === "ACTIVE" && !pending && <ActForm action={proposeReleaseAction} hidden={{ hold: r.hold.id, note: "Explanation checked" }} label="Propose release" variant="ghost" size="sm" testid="propose-release" />}
                    {pending && <span className="chip chip-warn">Release waiting approval</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
