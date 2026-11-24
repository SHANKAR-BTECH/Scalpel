"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { demo } from "@/lib/data";
import type { MemoCase } from "@/lib/demo-schema";
import { formatRupees } from "@/lib/money";
import { istDate, maskAccount, STATE_WORD } from "@/lib/rules";
import { heldNow, RULE_LABEL, sortCases, useDesk, type CaseState } from "@/lib/desk";
import { HoldBars } from "./HoldBars";
import { CaseActions, StatusChip, statusOf } from "./CaseActions";
import { EASE_OUT, SPRING } from "./ui/motion";
import { RoleNow, Steps } from "@/app/memo/Memo";

type Msg =
  | { id: string; kind: "guide"; from: string; subject: string; preview: string; at: number }
  | { id: string; kind: "request"; c: MemoCase; from: string; subject: string; preview: string; at: number }
  | { id: string; kind: "holder"; c: MemoCase; from: string; subject: string; preview: string; at: number };

const TITLE: Record<string, string> = { D09001: "Savings account, money straight from 3 victims", D00191: "Shop's current account, a little scam money" };

export function Inbox() {
  const desk = useDesk();
  const { rule, get } = desk;
  const cases = useMemo(() => sortCases(demo.memo.cases, rule), [rule]);
  const shop = demo.memo.cases.find((c) => c.account === "D00191");

  const msgs: Msg[] = useMemo(() => {
    const out: Msg[] = [];
    if (shop && get(shop.account).notice) {
      out.push({ id: "holder-" + shop.account, kind: "holder", c: shop, from: `Account holder ${maskAccount(shop.account)}`, subject: "Why is part of my shop's money held?",
        preview: "I got your notice. I run a shop and need this account to pay suppliers…", at: shop.asOf + 3_600_000 });
    }
    for (const c of cases) {
      out.push({ id: c.account, kind: "request", c, from: "Cyber Crime Police (demo)", subject: `Hold request · ${TITLE[c.account] ?? c.type.toLowerCase()}`,
        preview: `NCRP ${c.ncrpAck} · ${c.requisitionBasis.replace("_", " s.")} · traced ${formatRupees(c.tracedPaise)}`, at: c.asOf });
    }
    out.push({ id: "guide", kind: "guide", from: "Scalpel", subject: "How this desk works", preview: "The problem, what you do here, and who may do what.", at: 0 });
    return out;
  }, [cases, get, shop]);

  const [sel, setSel] = useState<string>(cases[0]?.account ?? "guide");
  const [ready, setReady] = useState(false); // read ?m= before showing a case, so a link never flashes the wrong one
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("m");
    if (q) setSel(q);
    setReady(true);
  }, []);
  const choose = (id: string) => {
    setSel(id);
    desk.markRead(id);
    try { history.replaceState(null, "", `?m=${encodeURIComponent(id)}`); } catch { /* ignore */ }
    if (window.innerWidth < 1024) document.getElementById("reader")?.scrollIntoView({ behavior: "smooth" });
  };
  const current = msgs.find((x) => x.id === sel) ?? msgs[0]!;

  return (
    <>
      <Kpis />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(290px,340px)_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px] items-start">
        <section className="card overflow-hidden lg:sticky lg:top-24" aria-label="Messages">
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line)" }}>
            <span className="font-semibold">Messages</span>
            <Link href="/order" className="text-[12.5px] muted hover:underline">Sorted: {RULE_LABEL[rule]}</Link>
          </div>
          <ul className="relative" data-testid="inbox-list">
            <AnimatePresence initial={false}>
              {msgs.map((x) => (
                <m.li key={x.id} layout transition={SPRING} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Row msg={x} active={x.id === current.id} unread={!desk.read[x.id] && x.kind !== "guide"} state={"c" in x ? get(x.c.account) : null} onClick={() => choose(x.id)} />
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <section id="reader" className="min-w-0 scroll-mt-32">
          <AnimatePresence mode="wait">
            {ready && <m.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: EASE_OUT }}>
              {current.kind === "request" && <CaseView c={current.c} />}
              {current.kind === "holder" && <HolderView c={current.c} />}
              {current.kind === "guide" && <GuideView />}
            </m.div>}
          </AnimatePresence>
        </section>

        <aside className="hidden xl:grid gap-4 sticky top-24" aria-label="Your role and the steps">
          <RoleNow role={desk.role} />
          {"c" in current && (
            <section className="card p-5">
              <p className="eyebrow">Steps for this hold</p>
              <Steps s={get(current.c.account)} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ msg, active, unread, state, onClick }: { msg: Msg; active: boolean; unread: boolean; state: CaseState | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} data-testid={`msg-${msg.id}`}
      className="group relative w-full text-left px-4 py-3.5 border-b transition-colors" style={{ borderColor: "var(--line)" }}>
      {active && <m.span layoutId="msg-active" transition={SPRING} className="absolute inset-0" style={{ background: "var(--accent-tint)", boxShadow: "inset 3px 0 0 var(--accent)" }} />}
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--bg)" }} aria-hidden />
      <span className="relative flex items-start gap-3">
        <Avatar kind={msg.kind} />
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[13.5px] ${unread ? "font-semibold" : ""}`}>{msg.from}</span>
            {msg.at > 0 && <span className="text-[11.5px] muted shrink-0">{istDate(msg.at)}</span>}
          </span>
          <span className={`block truncate text-[14.5px] mt-0.5 ${unread ? "font-semibold" : "font-medium"}`}>{msg.subject}</span>
          <span className="block truncate text-[13px] muted mt-0.5">{msg.preview}</span>
          {state && msg.kind === "request" && <span className="block mt-2"><StatusChip s={state} /></span>}
        </span>
        {unread && <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: "var(--accent)" }} aria-label="unread" />}
      </span>
    </button>
  );
}

function Avatar({ kind }: { kind: Msg["kind"] }) {
  const bg = kind === "request" ? "var(--accent-tint)" : kind === "holder" ? "var(--hold-tint)" : "var(--bg-2)";
  const fg = kind === "request" ? "var(--accent-ink)" : kind === "holder" ? "var(--hold)" : "var(--muted)";
  return (
    <span className="relative w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: bg, color: fg }} aria-hidden>
      {kind === "request" ? (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M10 2.5 16 5v4.5c0 3.8-2.6 6.6-6 8-3.4-1.4-6-4.2-6-8V5l6-2.5Z" /></svg>
      ) : kind === "holder" ? (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3.5 8.5 5 4h10l1.5 4.5M3.5 8.5h13M3.5 8.5V16h13V8.5M8 16v-4h4v4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.1" /></svg>
      )}
    </span>
  );
}

/** Desk totals that move as you act on cases. */
function Kpis() {
  const { get } = useDesk();
  const cs = demo.memo.cases;
  const open = cs.filter((c) => get(c.account).exact !== "approved").length;
  const waiting = cs.filter((c) => { const s = get(c.account); return s.exact === "proposed" || s.whole === "proposed"; }).length;
  const totals = cs.reduce((t, c) => { const h = heldNow(c, get(c.account)); return { held: t.held + h.held, innocent: t.innocent + h.innocent }; }, { held: 0, innocent: 0 });
  const tiles = [
    { label: "Open requests", value: String(open), testid: "kpi-open" },
    { label: "Waiting for a supervisor", value: String(waiting), testid: "kpi-waiting" },
    { label: "Money on hold now", value: formatRupees(totals.held), color: "var(--hold)", testid: "kpi-held" },
    { label: "Innocent money locked", value: formatRupees(totals.innocent), color: totals.innocent > 0 ? "var(--freeze)" : undefined, testid: "kpi-innocent" },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="card-flat lift px-5 py-4" data-testid={t.testid}>
          <p className="eyebrow !mb-0 !text-[10.5px]">{t.label}</p>
          <m.p key={t.value} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="num text-[26px] font-semibold tracking-[-0.02em] mt-1" style={{ color: t.color }}>{t.value}</m.p>
        </div>
      ))}
    </div>
  );
}

export function CaseView({ c }: { c: MemoCase }) {
  const { get } = useDesk();
  const s = get(c.account);
  const paidIn = c.hops.reduce((t, h) => t + h.amountPaise, 0);
  const direct = c.layer === 1;
  return (
    <article className="card" data-testid="case-view">
      <header className="px-5 sm:px-7 pt-6 pb-5 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-2 text-[13px] muted">
          <span>Cyber Crime Police Station (demo)</span><span aria-hidden>·</span><span className="font-mono">NCRP {c.ncrpAck}</span><span className="tag">invented</span>
        </div>
        <h2 className="title text-[24px] sm:text-[28px] mt-2">{TITLE[c.account] ?? "Hold request"}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip s={s} />
          <span className="tag">Account <span className="font-mono">{maskAccount(c.account)}</span> · {c.type.toLowerCase()}</span>
          <span className="tag">{c.regimeLabel}</span>
        </div>
      </header>

      <div className="px-5 sm:px-7 py-6 grid gap-8">
        <section>
          <p className="eyebrow">Suggested hold</p>
          <div className="card-flat p-4 sm:p-5" style={{ background: "linear-gradient(180deg, var(--card), #f7fafa)" }}><HoldBars heldPaise={c.heldPaise} balancePaise={c.balancePaise} /></div>
        </section>

        <section>
          <p className="eyebrow">What happened</p>
          <p className="text-[15.5px] leading-[1.7]">
            {direct
              ? <>Victims paid this account directly: {c.hops.length} payments, {formatRupees(paidIn)} in all, reported on the cybercrime portal.</>
              : <>Scam money reached this account {c.layer} hops from the victims, mixed with ordinary payments.</>}
            {" "}It holds <b className="mono">{formatRupees(c.balancePaise)}</b> today, of which <b className="mono" style={{ color: "var(--hold)" }}>{formatRupees(c.tracedPaise)}</b> is traced victim money.
          </p>
          <p className="mt-2 text-[14.5px] muted leading-[1.7]">
            <b style={{ color: "var(--fg)" }}>The problem:</b> a whole freeze would also lock {formatRupees(c.balancePaise - c.tracedPaise)} that is not scam money{direct ? "" : ", money a shopkeeper needs for suppliers and staff"}.
          </p>
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow !mb-0">Rule checks</p>
            <Link href={`/memo?a=${c.account}`} className="link text-[13.5px]">Sources in the memo</Link>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {(["allowed", "sized", "timed"] as const).map((k) => {
              const st = c.badgeStates[k];
              const col = st === "pass" ? "var(--good)" : st === "caution" ? "var(--warn)" : "var(--bad)";
              const tint = st === "pass" ? "var(--good-tint)" : st === "caution" ? "var(--warn-tint)" : "var(--freeze-tint)";
              return (
                <li key={k} className="card-flat lift px-4 py-3" style={{ borderTop: `3px solid ${col}`, background: `linear-gradient(180deg, ${tint}, var(--card) 55%)` }}>
                  <p className="font-semibold">{{ allowed: "Allowed?", sized: "Right size?", timed: "On time?" }[k]}</p>
                  <p className="text-[13.5px] font-semibold mt-0.5" style={{ color: col }}>{STATE_WORD[st]}</p>
                  {c.badgeReasons[k][0] && <p className="text-[12.5px] muted mt-1 leading-snug">{c.badgeReasons[k][0]}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <p className="eyebrow">Money trail into this account</p>
          <div className="overflow-x-auto mt-2">
            <table className="data-table">
              <thead><tr><th>Date</th><th>From</th><th>Credit</th><th>Of it, scam money</th></tr></thead>
              <tbody>
                {[...c.hops].sort((a, b) => b.taintPaise - a.taintPaise).slice(0, 4).map((h) => (
                  <tr key={h.utr}><td>{istDate(h.at)}</td><td className="font-mono text-[13px]">{maskAccount(h.from)}</td><td className="mono">{formatRupees(h.amountPaise)}</td><td className="mono" style={{ color: "var(--hold)" }}>{formatRupees(h.taintPaise)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.hops.length > 4 && <p className="text-[13px] muted mt-1">{c.hops.length - 4} smaller credits are listed in the memo.</p>}
        </section>

        <CaseActions c={c} />
      </div>
    </article>
  );
}

function HolderView({ c }: { c: MemoCase }) {
  return (
    <article className="card px-5 sm:px-7 py-6" data-testid="holder-view">
      <p className="text-[13px] muted">From the account holder of <span className="font-mono">{maskAccount(c.account)}</span> · reply to your notice</p>
      <h2 className="title text-[24px] sm:text-[28px] mt-2">Why is part of my shop&apos;s money held?</h2>
      <blockquote className="mt-4 rounded-xl p-4 text-[15.5px] leading-relaxed" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
        &ldquo;I got your notice. I run a shop and need this account to pay suppliers. I did nothing wrong. A customer paid me and I sent the goods. Is my whole account blocked?&rdquo;
        <span className="block text-[12.5px] muted mt-2">An invented message, to show what the desk handles after a hold.</span>
      </blockquote>
      <h3 className="font-semibold text-[17px] mt-6">What the desk can tell them</h3>
      <ul className="mt-2 grid gap-2 text-[15px] leading-relaxed list-disc ml-5">
        <li>Only <b className="mono">{formatRupees(c.heldPaise)}</b> is held. The other <b className="mono">{formatRupees(c.balancePaise - c.heldPaise)}</b> can be used as normal.</li>
        <li>The amount is the scam money traced into the account, payment by payment. The memo lists each payment.</li>
        <li>To contest: explain at the branch. The bank files it, the investigating officer decides or records reasons, and if nothing happens it goes to the District Grievance Officer. Court is always open.</li>
        <li>At 90 days a contested hold must be reviewed; the bank may lift it unless the police extend it. <span className="tag">source being checked</span></li>
      </ul>
      <div className="mt-6"><Link href={`/memo?a=${c.account}`} className="link font-medium">Open the shop&apos;s hold memo</Link></div>
    </article>
  );
}

function GuideView() {
  const axe = demo.headlineV2.axe;
  return (
    <article className="card px-5 sm:px-7 py-6" data-testid="guide-view">
      <h2 className="title text-[24px] sm:text-[28px]">How this desk works</h2>
      <h3 className="font-semibold text-[17px] mt-5">The problem</h3>
      <p className="mt-2 text-[15.5px] leading-relaxed">
        When a scam is reported, banks often freeze the whole account the money went to. Shops and ordinary people further down the chain lose access to all their money,
        not just the scam part. In our test worlds, whole freezes locked <b className="mono">{formatRupees(axe.innocentHeldPaise)}</b> of innocent money and cut off <b>{axe.peopleWronglyRestricted.toLocaleString("en-IN")}</b> people.
      </p>
      <h3 className="font-semibold text-[17px] mt-5">What you do here</h3>
      <ol className="mt-2 grid gap-1.5 text-[15px] leading-relaxed list-decimal ml-5">
        <li>Open a police request in the inbox. Read what happened and the suggested hold.</li>
        <li>As <b>Officer</b>, propose the exact hold. Propose a whole freeze only if the rules offer it.</li>
        <li>Switch to <b>Supervisor</b> (top right) and approve. Nobody can do both steps.</li>
        <li>Send the notice to the account holder, then open the hold memo to print the proof.</li>
      </ol>
      <h3 className="font-semibold text-[17px] mt-5">The other tabs</h3>
      <ul className="mt-2 grid gap-1.5 text-[15px] leading-relaxed list-disc ml-5">
        <li><b>Hold memo:</b> the one-page record for each hold, with the laws behind each check. Print it.</li>
        <li><b>72-hour replay:</b> pick the bank&apos;s hold policy and see the money saved against innocent people hurt over 3 days.</li>
        <li><b>Work order:</b> choose how this inbox is sorted, with the evidence for each choice.</li>
      </ul>
      <p className="mt-5 text-[13.5px] muted">Everything here is simulated with invented accounts. Your actions are saved only in this browser.</p>
    </article>
  );
}

export { statusOf };
