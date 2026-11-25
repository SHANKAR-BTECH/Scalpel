import Link from "next/link";
import { redirect } from "next/navigation";
import { holderRef } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { store } from "@/lib/server/store";
import { caseById, model, W } from "@/lib/server/world";
import { ActForm } from "@/components/ActForm";
import { holderReplyAction } from "@/app/actions";
import { day, inDays, inr, when } from "@/lib/format";

export default async function Status() {
  const ref = await holderRef();
  if (!ref) redirect("/portal");
  const d = await desk();
  const row = d.holds.find((h) => h.ref === ref);
  if (!row) redirect("/portal");
  const v = model().accounts.get(row.hold.account)!;
  const c = caseById(row.caseId);
  const notes = await (await store()).notes(`holder:${ref}`);
  const review = row.clocks.find((x) => x.clock.id === "release_90");
  const active = row.hold.state === "ACTIVE";
  return (
    <div className="mx-auto max-w-[760px]">
      <p className="eyebrow">Hold <span className="mono">{ref}</span> · {W.bank.name}</p>
      <h1 className="mt-1">{active ? `${inr(row.hold.amount)} of your money is on hold` : "Your hold has been lifted"}</h1>
      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-[13px] muted">On hold</p><p className="money text-[24px] text-[var(--accent)]" data-testid="held">{active ? inr(row.hold.amount) : "₹0"}</p></div>
        <div className="card p-4"><p className="text-[13px] muted">Free to use</p><p className="money text-[24px]">{inr(Math.max(0, v.balance - (active ? row.hold.amount : 0)))}</p></div>
        <div className="card p-4"><p className="text-[13px] muted">Bank must review by</p><p className="text-[18px] font-semibold">{review?.dueAt ? day(review.dueAt) : "—"}</p>{review?.dueAt && <p className="text-[12px] muted">{inDays(review.dueAt, d.now)}</p>}</div>
      </section>
      <section className="mt-5 card p-4">
        <h2>Why</h2>
        <p className="mt-1 text-[14.5px]">The police sent a request (Cyber Crime Police Station, {v.request.issuer.station.replace("Cyber Crime PS, ", "")}) about a {c?.scamType.toLowerCase()} fraud complaint. Money from that fraud reached your account. Only that amount is held; the rest of your balance is yours to use.</p>
        <p className="mt-2 text-[13.5px] muted">This does not mean you did anything wrong. Many people receive scam money without knowing, for example as payment for goods.</p>
      </section>
      <section className="mt-4 card p-4" data-testid="explain">
        <h2>Explain the payment</h2>
        {row.reply ? (
          <div className="mt-2 text-[14px]">
            <p className="chip chip-good">Sent {when(row.reply.at)}</p>
            <p className="mt-2">&ldquo;{row.reply.text}&rdquo;</p>
            {row.reply.fileName && <p className="mt-1 muted">📎 {row.reply.fileName}</p>}
            <p className="mt-2 text-[13.5px] muted">{row.grmUploaded ? "The bank has sent it to the police officer, who has 15 days to decide." : "The bank will send it to the police within 7 days."}</p>
          </div>
        ) : active ? (
          <ActForm action={holderReplyAction} label="Send my explanation" className="mt-2 space-y-3" testid="reply">
            <textarea name="text" required minLength={10} rows={4} className="input" placeholder="For example: this was a customer's payment for a blouse order on 3 December. Order book photo attached." />
            <div><label className="text-[13px] font-medium" htmlFor="file">Attach a document (photo or PDF)</label><input id="file" type="file" name="file" accept="image/*,application/pdf" className="mt-1 block text-[13px]" /><p className="mt-1 text-[12px] muted">Only the file name is kept.</p></div>
          </ActForm>
        ) : <p className="mt-2 muted">Nothing more to do.</p>}
      </section>
      <section className="mt-4 card p-4">
        <h2>Messages</h2>
        <ul className="mt-2 space-y-2 text-[14px]" data-testid="holder-messages">
          {notes.map((n) => <li key={n.id} className="rounded-lg bg-[var(--panel)] p-3">{n.text}<span className="mt-1 block text-[12px] muted">{when(n.at)}</span></li>)}
        </ul>
      </section>
      <section className="mt-4 panel p-4 text-[13.5px]">
        <p className="font-semibold">Your rights</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 muted">
          <li>Only the amount linked to the complaint may be held, not your whole account.</li>
          <li>You can explain at any time; the police officer must then decide within 15 days.</li>
          <li>Free legal help: your District Legal Services Authority (NALSA helpline 15100).</li>
        </ul>
        <p className="mt-2"><Link className="link" href="/portal">Look up another hold</Link></p>
      </section>
    </div>
  );
}
