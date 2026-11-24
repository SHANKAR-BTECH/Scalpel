"use client";
/**
 * The demo desk's shared state: who is at the keyboard, what each case's hold status is, and how the inbox is sorted.
 * It lives in this browser only (no server, no login). Reloading keeps it; "Reset demo" clears it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MemoCase } from "./demo-schema";

export type Role = "officer" | "supervisor";
export type Step = "none" | "proposed" | "approved";
export type CaseState = { exact: Step; whole: Step; notice: boolean; log: { at: number; who: Role; what: string }[] };
export type Rule = "biggest" | "model" | "signs" | "fcfs";

const EMPTY: CaseState = { exact: "none", whole: "none", notice: false, log: [] };
const KEY = "scalpel-desk-v1";

type Desk = {
  role: Role; setRole: (r: Role) => void;
  rule: Rule; setRule: (r: Rule) => void;
  get: (account: string) => CaseState;
  act: (account: string, change: Partial<Omit<CaseState, "log">>, what: string) => void;
  reset: () => void;
  read: Record<string, boolean>; markRead: (id: string) => void;
};

const Ctx = createContext<Desk | null>(null);

export function DeskProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("officer");
  const [rule, setRule] = useState<Rule>("biggest");
  const [cases, setCases] = useState<Record<string, CaseState>>({});
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.role === "officer" || s.role === "supervisor") setRole(s.role);
        if (["biggest", "model", "signs", "fcfs"].includes(s.rule)) setRule(s.rule);
        if (s.cases && typeof s.cases === "object") setCases(s.cases);
        if (s.read && typeof s.read === "object") setRead(s.read);
      }
    } catch { /* private window or blocked storage: start fresh */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify({ role, rule, cases, read })); } catch { /* ignore */ }
  }, [loaded, role, rule, cases, read]);

  const get = useCallback((a: string) => cases[a] ?? EMPTY, [cases]);
  const act = useCallback((a: string, change: Partial<Omit<CaseState, "log">>, what: string) => {
    setCases((s) => {
      const cur = s[a] ?? EMPTY;
      return { ...s, [a]: { ...cur, ...change, log: [...cur.log, { at: Date.now(), who: role, what }] } };
    });
  }, [role]);
  const reset = useCallback(() => { setCases({}); setRead({}); }, []);
  const markRead = useCallback((id: string) => setRead((r) => (r[id] ? r : { ...r, [id]: true })), []);

  const value = useMemo(() => ({ role, setRole, rule, setRule, get, act, reset, read, markRead }), [role, rule, get, act, reset, read, markRead]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDesk outside DeskProvider");
  return d;
}

/** Money the bank is actually holding for a case right now, and how much of it is innocent money. */
export function heldNow(c: MemoCase, s: CaseState): { held: number; innocent: number } {
  if (s.whole === "approved") return { held: c.balancePaise, innocent: c.balancePaise - c.tracedPaise };
  if (s.exact === "approved") return { held: c.heldPaise, innocent: 0 };
  return { held: 0, innocent: 0 };
}

export const RULE_LABEL: Record<Rule, string> = {
  biggest: "Biggest amount first",
  model: "Mule-score model",
  signs: "Most warning signs first",
  fcfs: "Oldest request first",
};

/** Sort cases the way the officer chose on the Who first? tab. */
export function sortCases(cases: MemoCase[], rule: Rule): MemoCase[] {
  const by: Record<Rule, (a: MemoCase, b: MemoCase) => number> = {
    biggest: (a, b) => b.tracedPaise - a.tracedPaise,
    model: (a, b) => b.muleScore - a.muleScore,
    signs: (a, b) => b.signals.length - a.signals.length,
    fcfs: (a, b) => a.asOf - b.asOf,
  };
  return [...cases].sort(by[rule]);
}
