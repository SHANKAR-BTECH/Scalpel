"use client";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import type { MemoCase } from "@/lib/demo-schema";
import { formatRupees } from "@/lib/money";
import { useDesk, type CaseState } from "@/lib/desk";
import { Button } from "./ui/Button";
import { SPRING } from "./ui/motion";
import { useState } from "react";
import { TracePanel } from "./TracePanel";

const s0 = (s: CaseState) => s.exact === "approved" || s.whole === "approved";

export function statusOf(s: CaseState): { text: string; fg: string; bg: string } {
  if (s.whole === "approved") return { text: "Whole account frozen", fg: "var(--freeze)", bg: "var(--freeze-tint)" };
  if (s.whole === "proposed") return { text: "Whole freeze waiting for supervisor", fg: "var(--warn)", bg: "var(--warn-tint)" };
  if (s.exact === "approved") return s.notice ? { text: "Held · holder notified", fg: "var(--good)", bg: "var(--good-tint)" } : { text: "Held · notice not sent", fg: "var(--hold)", bg: "var(--hold-tint)" };
  if (s.exact === "proposed") return { text: "Waiting for supervisor", fg: "var(--warn)", bg: "var(--warn-tint)" };
  return { text: "New request", fg: "var(--accent-ink)", bg: "var(--accent-tint)" };
}

export function StatusChip({ s }: { s: CaseState }) {
  const st = statusOf(s);
  return <span className="chip" style={{ color: st.fg, background: st.bg }} data-testid="status-chip">{st.text}</span>;
}

const STEPS = ["Request received", "Hold proposed", "Approved", "Holder notified"] as const;

export function Progress({ s }: { s: CaseState }) {
  const done = 1 + (s.exact !== "none" ? 1 : 0) + (s.exact === "approved" ? 1 : 0) + (s.notice ? 1 : 0);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progress of this hold">
      {STEPS.map((label, i) => {
        const on = i < done;
        return (
          <li key={label} className="min-w-0">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
              <m.div className="h-full rounded-full" style={{ background: "var(--accent)" }} initial={false} animate={{ width: on ? "100%" : "0%" }} transition={SPRING} />
            </div>
            <p className={`text-[12px] mt-1.5 truncate ${on ? "font-semibold" : "muted"}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** The buttons an officer or supervisor may press on one case. Only the allowed ones are live; the rest say why not. */
export function CaseActions({ c, showMemoLink = true, compact = false }: { c: MemoCase; showMemoLink?: boolean; compact?: boolean }) {
  const { role, get, act, reset } = useDesk();
  const [tracing, setTracing] = useState(false);
  const approved = s0(get(c.account));
  const s = get(c.account);
  const officer = role === "officer";
  const held = formatRupees(c.heldPaise);

  const buttons: { label: string; onClick: () => void; variant?: "primary" | "secondary" | "danger"; testid: string }[] = [];
  let note = "";
  if (officer) {
    if (s.exact === "none") buttons.push({ label: `Propose exact hold of ${held}`, variant: "primary", testid: "act-propose-exact", onClick: () => act(c.account, { exact: "proposed" }, `proposed an exact hold of ${held}`) });
    if (s.exact === "approved" && !s.notice) buttons.push({ label: "Send notice to account holder", variant: "primary", testid: "act-notice", onClick: () => act(c.account, { notice: true }, "sent the notice to the account holder") });
    if (c.suggestedWholeFreeze && s.whole === "none" && s.exact !== "none")
      buttons.push({ label: "Propose whole freeze (last resort)", variant: "danger", testid: "act-propose-whole", onClick: () => act(c.account, { whole: "proposed" }, "proposed a whole-account freeze") });
    if (s.exact === "proposed" || s.whole === "proposed") note = "Waiting for a supervisor. Switch to Supervisor at the top right.";
    else if (!buttons.length) note = "Nothing left for the officer on this case.";
  } else {
    if (s.exact === "proposed") {
      buttons.push({ label: `Approve hold of ${held}`, variant: "primary", testid: "act-approve-exact", onClick: () => act(c.account, { exact: "approved" }, `approved the exact hold of ${held}`) });
      buttons.push({ label: "Send back", testid: "act-reject-exact", onClick: () => act(c.account, { exact: "none" }, "sent the hold back to the officer") });
    }
    if (s.whole === "proposed") {
      buttons.push({ label: `Approve whole freeze of ${formatRupees(c.balancePaise)}`, variant: "danger", testid: "act-approve-whole", onClick: () => act(c.account, { whole: "approved" }, "approved the whole-account freeze") });
      buttons.push({ label: "Refuse whole freeze", testid: "act-refuse-whole", onClick: () => act(c.account, { whole: "none" }, "refused the whole-account freeze") });
    }
    if (!buttons.length) note = s.exact === "none" ? "Nothing to approve yet. The officer proposes first." : "Nothing waiting for a supervisor on this case.";
  }

  const traceBtn = approved && (
    <m.span key="trace" layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING}>
      <Button data-testid="act-trace" onClick={() => setTracing(true)} className={compact ? "w-full" : ""}
        style={{ color: "var(--accent-ink)", borderColor: "var(--accent-line)", background: "var(--accent-tint)" }}>
        <span className="relative grid place-items-center w-3 h-3" aria-hidden>
          <span className="absolute w-3 h-3 rounded-full animate-ping" style={{ background: "var(--hold-fill)", opacity: 0.5 }} />
          <span className="relative w-2 h-2 rounded-full" style={{ background: "var(--hold-fill)" }} />
        </span>
        Trace the money
      </Button>
    </m.span>
  );

  if (compact) {
    return (
      <section className="grid gap-2.5" data-testid="case-actions">
        <AnimatePresence mode="popLayout" initial={false}>
          {buttons.map((b) => (
            <m.span key={b.testid} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SPRING}>
              <Button variant={b.variant === "danger" ? "secondary" : b.variant ?? "secondary"} data-testid={b.testid} onClick={b.onClick} className="w-full"
                style={b.variant === "danger" ? { color: "var(--freeze)", borderColor: "color-mix(in srgb, var(--freeze) 40%, transparent)" } : undefined}>{b.label}</Button>
            </m.span>
          ))}
          {traceBtn}
        </AnimatePresence>
        {note && <p className="text-[13px] muted">{note}</p>}
        <TracePanel c={c} open={tracing} onClose={() => setTracing(false)} />
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <Progress s={s} />
      <div className="glass sticky bottom-4 z-10 rounded-2xl p-3 sm:p-4" data-testid="case-actions">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] font-semibold mr-1">As {officer ? "Officer" : "Supervisor"}:</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {buttons.map((b) => (
              <m.span key={b.testid} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={SPRING}>
                <Button variant={b.variant === "danger" ? "secondary" : b.variant ?? "secondary"} data-testid={b.testid} onClick={b.onClick}
                  style={b.variant === "danger" ? { color: "var(--freeze)", borderColor: "color-mix(in srgb, var(--freeze) 40%, transparent)" } : undefined}>
                  {b.label}
                </Button>
              </m.span>
            ))}
            {traceBtn}
          </AnimatePresence>
          {note && <span className="text-[13.5px] muted">{note}</span>}
          {showMemoLink && <Link href={`/memo?a=${c.account}`} className="ml-auto text-[13.5px] font-semibold link">Open hold memo</Link>}
        </div>
      </div>
      <TracePanel c={c} open={tracing} onClose={() => setTracing(false)} />
      {s.log.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-[15px]">Activity</h3>
            <button type="button" onClick={reset} className="text-[12.5px] muted hover:underline">Reset demo</button>
          </div>
          <ul className="mt-2 grid gap-1.5" data-testid="activity">
            {s.log.map((l, i) => (
              <m.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="text-[13.5px] flex gap-2">
                <span className="mono muted shrink-0">{new Date(l.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span><b>{l.who === "officer" ? "Officer" : "Supervisor"}</b> {l.what}</span>
              </m.li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
