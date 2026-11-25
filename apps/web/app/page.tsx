import Link from "next/link";
import { model, W } from "@/lib/server/world";
import { CountUp } from "@/components/CountUp";

export default function Home() {
  const m = model();
  const rig = W.rigs.reduce((a, b) => (b.sims.length > a.sims.length ? b : a));
  const reported = m.cases.reduce((s, c) => s + c.reported, 0);
  const catchable = m.cases.reduce((s, c) => s + c.catchable, 0);
  return (
    <div>
      <section className="grid gap-8 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <h1 className="text-[40px] leading-[1.08] tracking-[-0.025em] sm:text-[50px]">Hold the scam money,<br />not the whole account.<br /><span className="text-[var(--phone)]">Block the scam phone,</span><br />not the innocent number.</h1>
          <p className="mt-4 max-w-[560px] text-[16.5px] muted">Scalpel follows money from the victim through every mule account, and the calls back to the phone that made them. It suggests the smallest lawful action, a second person approves it, and every step is written into a record nobody can quietly change.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/login" className="btn btn-primary">Sign in to the demo</Link>
            <Link href="/portal" className="btn btn-ghost">My money is on hold</Link>
            <Link href="/verify" className="btn btn-ghost">Verify an evidence file</Link>
          </div>
        </div>
        <div className="card p-5">
          <h2>Right now at Bharat Demo Bank</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <div><dt className="text-[13px] muted">Fraud complaints</dt><dd className="money text-[26px]"><CountUp value={W.complaints.length} /></dd></div>
            <div><dt className="text-[13px] muted">Linked into cases</dt><dd className="money text-[26px]"><CountUp value={m.cases.length} /></dd></div>
            <div><dt className="text-[13px] muted">Victims reported</dt><dd className="money text-[26px]"><CountUp value={reported} format="inrShort" /></dd></div>
            <div><dt className="text-[13px] muted">Still in accounts</dt><dd className="money text-[26px] text-[var(--accent)]"><CountUp value={catchable} format="inrShort" /></dd></div>
          </dl>
          <p className="mt-4 rounded-lg bg-[var(--phone-tint)] p-3 text-[13.5px] text-[var(--phone)]">One SIM box with {rig.sims.length} SIMs made the calls behind {m.casesOfRig.get(rig.id)?.length ?? 0} separate cases.</p>
        </div>
      </section>
      <section className="mt-10">
        <h2>How a case moves</h2>
        <ol className="steps mt-4">
          {[
            ["Follow", "Police requests and complaints arrive at the bank. Scalpel joins complaints that share accounts or phones into one case and traces where the money went next. Telco-A traces the calls back to the phone."],
            ["Decide", "For every account the AI suggests the exact amount to hold, never the whole balance, and the officer decides with it. Telco-A's analyst decides on the handset or SIM box, never a spoofed number."],
            ["Prove", "A supervisor approves, the account holder is told and can explain online, deadlines are tracked, and compliance downloads an evidence file anyone can verify."],
          ].map(([t, d]) => (
            <li key={t} className="step"><h3>{t}</h3><p className="mt-1 text-[14px] muted">{d}</p></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
