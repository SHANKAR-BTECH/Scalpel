import Link from "next/link";
import { demo } from "@/lib/data";
import { formatRupees } from "@/lib/money";
import { HeadlineCards } from "@/components/HeadlineCards";
import { Provenance } from "@/components/Provenance";
import { HoldBars } from "@/components/HoldBars";
import { TradeOff } from "@/components/TradeOff";
import { RoleCard } from "@/components/Roles";
import { Reveal } from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { FullData } from "@/components/ui/Explain";
import { POLICY_KEYS, type MemoCase } from "@/lib/demo-schema";
import { POLICY_LABEL, ratioText } from "@/lib/policies";
import { pct } from "@/lib/order";
import { istDate, STATE_WORD } from "@/lib/rules";

const BADGE_TITLE = { allowed: "Allowed?", sized: "Right size?", timed: "On time?" } as const;
const BADGE_PLAIN = {
  allowed: "Is this person or authority allowed to ask for a hold here?",
  sized: "Is the hold no bigger than the scam money traced into the account?",
  timed: "Are the legal deadlines for this hold being tracked?",
} as const;

export default function Home() {
  const w = demo.world;
  const story = demo.memo.cases.find((c) => c.account === "D09001") ?? demo.memo.cases[0]!;
  const shop = demo.memo.cases.find((c) => c.account === "D00191") ?? demo.memo.cases[0]!;
  const paidIn = story.hops.reduce((s, h) => s + h.amountPaise, 0);
  const axe = demo.headlineV2.axe, exact = demo.headlineV2.scalpel;
  const lanes = demo.replay.lanes;
  const v3 = demo.order.v3;

  return (
    <>
      {/* Opening: the situation, before any numbers. */}
      <section className="pt-12 sm:pt-20 max-w-4xl">
        <p className="eyebrow">A fraud complaint reaches a bank · simulation</p>
        <h1 className="display text-[42px] sm:text-[62px] mt-4">
          A scam was just reported.<br /><span style={{ color: "var(--accent)" }}>How much should the bank freeze?</span>
        </h1>
        <p className="mt-6 text-[18px] sm:text-[19px] leading-relaxed muted max-w-3xl">
          Today many banks freeze the <b style={{ color: "var(--fg)" }}>whole account</b> the money went to. That stops the scammer, but it also locks shopkeepers and
          ordinary people out of their own money. Scalpel holds <b style={{ color: "var(--fg)" }}>only the scam money</b>, checks each hold against the rules, and prints the proof.
          Follow one complaint from start to finish below.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="#story" variant="primary">Follow the complaint</ButtonLink>
          <ButtonLink href={`/memo?a=${story.account}`}>Skip to the hold memo</ButtonLink>
        </div>
      </section>

      {/* The story in the main column, the worked examples in a side panel that stays in view. */}
      <div className="mt-16 sm:mt-24 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] items-start" id="story">
        <ol className="relative grid gap-8">
          <span aria-hidden className="absolute left-[19px] top-4 bottom-4 w-px hidden sm:block" style={{ background: "var(--line-strong)" }} />

          <Scene n={1} kicker={`${istDate(story.hops[0]!.at)} · the complaint`} title="Ravi pays for a job that does not exist, then calls 1930.">
            <p>
              Ravi (an invented person) is promised a work-from-home job and pays {formatRupees(story.hops[0]!.amountPaise)} as a &ldquo;joining fee&rdquo;. Two other
              people are tricked the same day and pay {story.hops.slice(1).map((h) => formatRupees(h.amountPaise)).join(" and ")} into the same savings account
              ({formatRupees(paidIn)} in all). They call the cybercrime helpline 1930 and get a complaint number on the national portal
              (<span className="font-mono text-[14px]">{story.ncrpAck}</span>, invented).
            </p>
          </Scene>

          <Scene n={2} kicker="The police ask the bank" title="A request to hold the money reaches the bank.">
            <p>
              The police send the bank a request to put a hold on the account ({story.requisitionBasis.replace("_", " s.")}, a police hold under the MHA&apos;s standard
              procedure). Now the bank must decide quickly, before more money leaves, and the question is <b>how much</b> to hold.
            </p>
          </Scene>

          <Scene n={3} kicker="Follow the money" title={`Only ${formatRupees(story.balancePaise)} is still there. ${formatRupees(story.tracedPaise)} of it is the victims' money.`}>
            <p>
              Scam money moves fast. By the time the bank acts, some has already left. Scalpel follows every payment in and out, hop by hop, and works out how much of what
              is left really belongs to the victims. Here that is <b>{formatRupees(story.tracedPaise)}</b> of the {formatRupees(story.balancePaise)} balance.
            </p>
            <p className="mt-3">
              The same thing happens further down the chain. In the same demo bank, a shop&apos;s current account received a small part of another scam, several hops later:
              only <b>{formatRupees(shop.tracedPaise)}</b> of its {formatRupees(shop.balancePaise)}. That shop is the second example in the side panel.
            </p>
          </Scene>

          <Scene n={4} kicker="Hold the exact amount, and check it" title={`Hold ${formatRupees(story.heldPaise)}. Then answer three questions.`}>
            <p>Scalpel proposes holding exactly the traced amount, and checks the hold against the rules before anyone signs it:</p>
            <ul className="grid gap-2.5 mt-3">
              {(["allowed", "sized", "timed"] as const).map((k) => <Check key={k} k={k} state={story.badgeStates[k]} />)}
            </ul>
            <p className="mt-3 text-[15px] muted">
              Each answer links to the law, rule or court judgment it rests on, so anyone can open the original and check it. Amber is not a failure: it means the deadline
              rules come from a source we have not yet checked word for word, so we flag it instead of calling it a clean pass.
            </p>
          </Scene>

          <Scene n={5} kicker="Two people decide, and the proof is printed" title="The officer proposes. The supervisor approves.">
            <p>
              The officer proposes the exact hold of {formatRupees(story.heldPaise)} and the supervisor signs it off. The rest of the money stays usable. This account looks
              strongly like a mule account (mule score {story.muleScore.toFixed(2)}), so the rules also allow a whole-account freeze, but only as a last resort: the officer
              proposes it and the supervisor must approve it. Neither person can do it alone. For the shop, a whole freeze is never offered.
            </p>
            <div className="grid gap-4 md:grid-cols-2 mt-5">
              <RoleCard role="officer" />
              <RoleCard role="supervisor" />
            </div>
            <p className="mt-4">
              Everything goes on a one-page hold memo: how much, the money trail, the three checks and their sources, the deadlines, and what the account holder is told and
              how they can contest it.
            </p>
            <p className="mt-2 text-[13.5px] muted">Officer and supervisor are demo roles to show the two-person rule. There is no real login on this site.</p>
            <div className="mt-5"><ButtonLink href={`/memo?a=${story.account}`} variant="primary">Open this memo</ButtonLink></div>
          </Scene>

          <Scene n={6} kicker="The next 72 hours" title="Exact holds against a whole freeze, hour by hour.">
            <p>
              We replay one invented month in the demo bank four ways. After 72 hours, exact holds have secured <b>{formatRupees(lanes.scalpel.securedPaise[72]!)}</b> of
              victim money and locked <b>{formatRupees(lanes.scalpel.innocentLockedPaise[72]!)}</b> of innocent money. A whole freeze secures {formatRupees(lanes.axe.securedPaise[72]!)},
              a little more, but locks <b>{formatRupees(lanes.axe.innocentLockedPaise[72]!)}</b> belonging to {lanes.axe.peopleRestricted[72]} people who did nothing wrong.
            </p>
            <div className="mt-5"><ButtonLink href="/replay" variant="primary">Watch the 72 hours</ButtonLink></div>
          </Scene>
        </ol>

        <aside className="lg:sticky lg:top-24 grid gap-4" aria-label="Demo examples">
          <p className="eyebrow">Demo examples · each account held two ways</p>
          <Example c={story} title="Example 1 · the account in the story" note="A savings account that received money straight from the victims." testid="example-story" />
          <Example c={shop} title="Example 2 · a shop further down the chain" note="A shop's current account that received a little scam money." testid="lead-hold" />
        </aside>
      </div>

      {/* Why it matters, at scale. */}
      <Section eyebrow="Why it matters" title="Across bigger test worlds, whole freezes hurt thousands of innocent people.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact big={formatRupees(axe.innocentHeldPaise)} label="innocent money locked by whole freezes" />
          <Fact big={axe.peopleWronglyRestricted.toLocaleString("en-IN")} label="people wrongly cut off from their accounts" />
          <Fact big={`${exact.peopleWronglyRestricted}`} label="people wrongly restricted with exact holds" accent />
        </div>
        <p className="mt-3 text-[14px] muted">Across 5 invented test worlds of about 3,000 accounts each. Every figure on this site is simulated.</p>
      </Section>

      <Section eyebrow="The trade-off, honestly" title="A whole freeze reaches more victim money. The price is paid by innocent people.">
        <TradeOff axe={axe} exact={exact} />
        <p className="mt-5 text-[16px] muted max-w-3xl leading-relaxed">
          A whole freeze also catches money from victims who have not complained yet. The law already points to exact holds, so Scalpel keeps a whole freeze only as a
          last resort that two people agree on. In the 72-hour replay of one small invented month, exact holds secured {formatRupees(lanes.scalpel.securedPaise[72]!)} with
          {" "}{formatRupees(lanes.scalpel.innocentLockedPaise[72]!)} of innocent money locked; a whole freeze secured {formatRupees(lanes.axe.securedPaise[72]!)} and locked {formatRupees(lanes.axe.innocentLockedPaise[72]!)}.
          {" "}<Link href="/replay" className="link">Watch it hour by hour</Link>.
        </p>
      </Section>

      <Section eyebrow="What did not work" title="The AI ordering did not beat the simple rule. We say so.">
        <div className="card p-6 sm:p-8" data-testid="not-earned">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-[17px]">Which account should the officer act on first?</p>
            <span className="stamp">{v3 ? v3.verdict : "not run"}</span>
          </div>
          {v3 && (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Fact big={pct(v3.headline.scalpel!)} label="mule-score model's order" accent />
                <Fact big={pct(v3.headline.biggest!)} label="simple rule to beat: biggest amount first" />
                <Fact big={`+${v3.marginPoints.toFixed(1)} pts`} label={`gap, against a pass mark of +${v3.passMarkPoints} set in advance`} />
              </div>
              <p className="mt-5 text-[16px] muted max-w-3xl leading-relaxed">
                Share of the best possible rescue, in a harder test world locked before any result was seen. Even perfect knowledge of who is a mule reaches only {pct(v3.headline.ceiling!)},
                because in these worlds the amount already gives the mules away. So Scalpel&apos;s value is the right-size holds and the proof, not the model.
              </p>
            </>
          )}
          <div className="mt-6"><ButtonLink href="/order">See the full test</ButtonLink></div>
        </div>
      </Section>

      <Reveal>
        <FullData title="All four approaches, side by side" testid="full-data">
          <p className="text-[15px] muted mb-4">
            Demo world: {w.accounts} invented accounts, {w.victims} victims, {w.complaints} complaints ({Math.round(w.reportRate * 100)}% of victims reported).
            Each card shows the hold ratio next to the victim money missed, so neither is read alone.
          </p>
          <HeadlineCards headline={demo.headline} />
          <h3 className="font-semibold mt-8">On the 5 unseen test worlds (about 3,000 accounts each)</h3>
          <div className="overflow-x-auto mt-2">
            <table className="data-table">
              <thead><tr><th>Approach</th><th>Held ÷ reported</th><th>Held ÷ all victim money</th><th>Victim money missed</th><th>Innocent money locked</th><th>People wrongly restricted</th></tr></thead>
              <tbody>
                {POLICY_KEYS.map((k) => {
                  const h = demo.headlineV2[k];
                  return (
                    <tr key={k}>
                      <td className="font-medium">{POLICY_LABEL[k]}</td><td className="num">{ratioText(h.reportedRatio)}</td><td className="num">{ratioText(h.freezeRatio)}</td>
                      <td className="num">{formatRupees(h.victimMoneyMissedPaise)} of {formatRupees(h.victimMoneyPaise)}</td>
                      <td className="num">{formatRupees(h.innocentHeldPaise)}</td><td className="num">{h.peopleWronglyRestricted}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FullData>
      </Reveal>
      <Provenance />
    </>
  );
}

function Scene({ n, kicker, title, children }: { n: number; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <li className="relative list-none sm:pl-16">
      <Reveal>
        <span className="hidden sm:flex absolute left-0 top-0 w-10 h-10 rounded-full items-center justify-center font-semibold num"
          style={{ background: "var(--card)", border: "1px solid var(--accent-line)", color: "var(--accent-ink)", boxShadow: "var(--shadow)" }}>{n}</span>
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-3"><span className="sm:hidden"><span className="step-badge">Step {n}</span></span><span className="eyebrow">{kicker}</span></div>
          <h2 className="display text-[26px] sm:text-[32px] mt-3">{title}</h2>
          <div className="mt-4 text-[16.5px] leading-relaxed">{children}</div>
        </div>
      </Reveal>
    </li>
  );
}

function Check({ k, state }: { k: keyof typeof BADGE_TITLE; state: "pass" | "caution" | "fail" }) {
  const col = state === "pass" ? "var(--good)" : state === "caution" ? "var(--warn)" : "var(--bad)";
  const tint = state === "pass" ? "var(--good-tint)" : state === "caution" ? "var(--warn-tint)" : "var(--freeze-tint)";
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-4 py-3" style={{ background: tint }}>
      <span><b>{BADGE_TITLE[k]}</b> <span className="text-[14.5px] muted">{BADGE_PLAIN[k]}</span></span>
      <span className="text-[14px] font-semibold" style={{ color: col }}>{STATE_WORD[state]}</span>
    </li>
  );
}

function Example({ c, title, note, testid }: { c: MemoCase; title: string; note: string; testid: string }) {
  return (
    <Link href={`/memo?a=${c.account}`} className="card p-5 block group" data-testid={testid}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>{title}</span>
        <span className="text-[12.5px] muted group-hover:underline shrink-0">Memo →</span>
      </div>
      <p className="mt-2 font-semibold text-[16px]">
        Hold {formatRupees(c.heldPaise)} of {formatRupees(c.balancePaise)}.{" "}
        <span className="font-normal muted">The other {formatRupees(c.balancePaise - c.heldPaise)} stays usable.</span>
      </p>
      <p className="text-[13px] muted mt-1">{note}</p>
      <div className="mt-4"><HoldBars heldPaise={c.heldPaise} balancePaise={c.balancePaise} compact /></div>
    </Link>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section" className="mt-20 sm:mt-28">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display text-[30px] sm:text-[40px] mt-3 mb-7 max-w-3xl">{title}</h2>
      {children}
    </Reveal>
  );
}

function Fact({ big, label, accent }: { big: string; label: string; accent?: boolean }) {
  return (
    <div className="card-flat p-6">
      <p className="num text-[32px] font-semibold tracking-tight leading-tight" style={{ color: accent ? "var(--accent)" : "var(--fg)" }}>{big}</p>
      <p className="text-[14.5px] muted mt-1">{label}</p>
    </div>
  );
}
