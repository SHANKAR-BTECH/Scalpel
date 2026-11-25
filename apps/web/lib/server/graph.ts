/** Lays out one case as a picture: phones → victims → accounts by layer → where the money left. */
import { model, exitLabel, holderName, W, type CaseView } from "./world";
import type { Desk } from "./desk";

export interface GNode {
  id: string; col: number; kind: "phone" | "victim" | "mule" | "innocent" | "group" | "exit";
  label: string; sub: string; amount: number; status?: "held" | "pending"; href?: string; tip?: string;
}
export interface GEdge { from: string; to: string; amount: number; kind: "money" | "call" | "exit"; calls?: number }
export interface Graph { nodes: GNode[]; edges: GEdge[]; cols: string[]; chain: string[] }

const inrShort = (p: number) => {
  const r = Math.round(p / 100);
  return r >= 100000 ? `₹${(r / 100000).toFixed(2)} L` : `₹${r.toLocaleString("en-IN")}`;
};

export function caseGraph(c: CaseView, d: Desk): Graph {
  const m = model();
  const nodes = new Map<string, GNode>();
  let edges: GEdge[] = [];
  const maxHop = Math.min(4, Math.max(1, ...c.accounts.map((a) => m.accounts.get(a)?.hop ?? 1)));
  const colOfHop = (h: number | null) => 1 + Math.min(maxHop, Math.max(1, h ?? 1));
  const exitCol = 2 + maxHop;

  // phones → victims
  for (const call of c.calls) {
    const rig = m.rigByImei.get(call.imei);
    const pid = rig ? `PH:${rig.id}` : `PH:${call.realSim}`;
    if (!nodes.has(pid)) nodes.set(pid, rig
      ? { id: pid, col: 0, kind: "phone", label: rig.kind === "simbox" ? `SIM box, ${rig.sims.length} SIMs` : `Handset, ${rig.sims.length} SIMs`, sub: `IMEI ${rig.imei.slice(0, 6)}…${rig.imei.slice(-4)}`, amount: 0, tip: `${rig.cell} (${rig.state})` }
      : { id: pid, col: 0, kind: "phone", label: "One SIM", sub: call.realSim, amount: 0, tip: "SIM swapped shortly before the calls" });
    const v = [...m.victimById.values()].find((x) => x.phone === call.to);
    if (!v) continue;
    const e = edges.find((x) => x.from === pid && x.to === `V:${v.id}`);
    if (e) e.calls = (e.calls ?? 1) + 1; else edges.push({ from: pid, to: `V:${v.id}`, amount: 0, kind: "call", calls: 1 });
  }
  for (const comp of c.complaints) {
    const v = m.victimById.get(comp.victim)!;
    const paid = W.txns.find((t) => t.id === comp.txnId)!.amount;
    nodes.set(`V:${v.id}`, { id: `V:${v.id}`, col: 1, kind: "victim", label: v.name, sub: `paid ${inrShort(paid)}`, amount: paid, tip: `${v.city} · ${comp.scamType}` });
  }
  for (const a of c.accounts) {
    const v = m.accounts.get(a)!;
    const held = d.holdByAccount.get(a);
    nodes.set(a, {
      id: a, col: colOfHop(v.hop), kind: v.role === "mule" ? "mule" : "innocent", label: holderName(v.a),
      sub: v.traced > 0 ? `still here ${inrShort(v.traced)}` : "all passed on", amount: v.traced,
      status: held ? "held" : d.pendingByAccount.has(a) ? "pending" : undefined, href: `#acct-${a}`,
      tip: `${v.a.type === "CURRENT" ? "Current" : v.a.type === "SALARY" ? "Salary" : "Savings"} account ${a}`,
    });
  }
  for (const e of c.edges) {
    if (e.exit) {
      const id = `X:${e.to}`;
      if (!nodes.has(id)) nodes.set(id, { id, col: exitCol, kind: "exit", label: exitLabel(e.to), sub: "", amount: 0 });
      nodes.get(id)!.amount += e.amount;
      edges.push({ from: e.from, to: id, amount: e.amount, kind: "exit" });
    } else edges.push({ from: e.from, to: e.to, amount: e.amount, kind: "money" });
  }
  for (const n of nodes.values()) if (n.kind === "exit") n.sub = `${inrShort(n.amount)} gone`;

  // Keep the picture readable: in each column keep the biggest nodes and fold the rest into one.
  const fold = (col: number, keep: number, pred: (n: GNode) => boolean, label: (k: number) => string) => {
    const xs = [...nodes.values()].filter((n) => n.col === col && pred(n)).sort((a, b) => b.amount - a.amount);
    if (xs.length <= keep + 1) return;
    const gone = new Set(xs.slice(keep).map((n) => n.id));
    const gid = `G:${col}:${label(0)}`;
    const amt = xs.slice(keep).reduce((s, n) => s + n.amount, 0);
    nodes.set(gid, { id: gid, col, kind: "group", label: label(gone.size), sub: amt ? `${inrShort(amt)}` : "", amount: amt });
    for (const id of gone) nodes.delete(id);
    const merged = new Map<string, GEdge>();
    for (const e of edges) {
      const f = gone.has(e.from) ? gid : e.from, t = gone.has(e.to) ? gid : e.to;
      if (f === t) continue;
      const k = `${f}>${t}>${e.kind}`;
      const x = merged.get(k);
      if (x) { x.amount += e.amount; x.calls = (x.calls ?? 0) + (e.calls ?? 0) || undefined; } else merged.set(k, { ...e, from: f, to: t });
    }
    edges = [...merged.values()];
  };
  fold(1, 7, () => true, (k) => `${k} more victims`);
  for (let col = 2; col < exitCol; col++) fold(col, 2, (n) => n.kind === "innocent", (k) => `${k} shops, people`);
  for (let col = 2; col < exitCol; col++) fold(col, 5, (n) => n.kind === "mule", (k) => `${k} more mules`);
  const cols = ["Phones", "Victims", ...Array.from({ length: maxHop }, (_, i) => (i === 0 ? "First accounts" : i === maxHop - 1 && maxHop === 4 ? "Layer 4+" : `Layer ${i + 1}`)), "Left the bank"];
  const kept = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  return { nodes: [...nodes.values()], edges: kept, cols, chain: strongestChain(kept, [...nodes.values()]) };
}

/** The main road the money took: from the victim who sent the most, keep following the biggest outgoing flow until it leaves the bank. */
function strongestChain(edges: GEdge[], nodes: GNode[]): string[] {
  const out = new Map<string, GEdge[]>();
  for (const e of edges) if (e.kind !== "call") out.set(e.from, [...(out.get(e.from) ?? []), e]);
  const sent = (id: string) => (out.get(id) ?? []).reduce((s, e) => s + e.amount, 0);
  const start = nodes.filter((n) => n.kind === "victim").sort((a, b) => sent(b.id) - sent(a.id))[0];
  if (!start) return [];
  const caller = edges.find((e) => e.kind === "call" && e.to === start.id)?.from;
  const chain = caller ? [caller, start.id] : [start.id];
  let cur = start.id;
  while (chain.length < 12) {
    const next = (out.get(cur) ?? []).filter((e) => !chain.includes(e.to)).sort((a, b) => b.amount - a.amount)[0];
    if (!next) break;
    chain.push(next.to);
    cur = next.to;
  }
  return chain;
}
