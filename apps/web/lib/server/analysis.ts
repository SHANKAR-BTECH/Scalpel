/** What Scalpel worked out for one case, step by step, so the case page can replay it.
 *  Every number here comes from the same model the rest of the site uses; nothing is made up for the show. */
import { model, holderName, W, type CaseView } from "./world";
import type { Graph } from "./graph";

export interface Analysis {
  caseId: string; scamType: string;
  complaints: { id: string; ack: string; victim: string; city: string; amount: number }[];
  requests: { count: number; whole: number; unsigned: number; stations: number; asked: number };
  calls: number; spoofed: { shown: string; owner?: string; protected: boolean }[];
  devices: { label: string; id: string; sims: number; used: number; victims: number; calls: number; simbox: boolean }[];
  hops: { label: string; accounts: number; money: number }[];
  movedOut: number; catchable: number;
  scored: { id: string; name: string; score: number; reasons: string[]; traced: number; mule: boolean }[];
  verdict: { holdAccounts: number; hold: number; asked: number; routeBack: number; mules: number; innocents: number };
  graph: Graph;
}

export function analyse(c: CaseView, graph: Graph): Analysis {
  const m = model();
  const accts = c.accounts.map((a) => m.accounts.get(a)!);
  const complaints = c.complaints.map((k) => {
    const v = m.victimById.get(k.victim)!;
    return { id: k.id, ack: k.ack, victim: v.name, city: v.city, amount: W.txns.find((t) => t.id === k.txnId)?.amount ?? 0 };
  });
  const asked = accts.reduce((s, v) => s + ("amount" in v.asked ? v.asked.amount : v.balance), 0);
  const devices = c.rigs.map((r) => {
    const rig = W.rigs.find((x) => x.id === r);
    const calls = c.calls.filter((k) => (rig ? k.imei === rig.imei : k.realSim === r));
    return {
      id: rig ? rig.imei : r, simbox: rig?.kind === "simbox",
      label: rig ? `${rig.kind === "simbox" ? "SIM box" : "Handset"}, ${rig.sims.length} SIMs` : "One SIM, swapped recently",
      sims: rig ? rig.sims.length : 1, used: new Set(calls.map((k) => k.realSim)).size, victims: new Set(calls.map((k) => k.to)).size, calls: calls.length,
    };
  });
  const hops = graph.cols.slice(2, -1).map((label, i) => {
    const col = i + 2;
    const here = accts.filter((v) => 1 + Math.min(4, Math.max(1, v.hop ?? 1)) === col);
    return { label, accounts: here.length, money: here.reduce((s, v) => s + v.received, 0) };
  });
  const scored = accts.filter((v) => v.a.score).map((v) => ({
    id: v.a.id, name: holderName(v.a), score: v.a.score!.muleScore, reasons: v.a.score!.reasons.slice(0, 3), traced: v.traced, mule: v.role === "mule",
  })).sort((a, b) => b.score - a.score || b.traced - a.traced);
  const holdable = accts.filter((v) => v.gate.decision !== "ROUTE" && v.gate.decision !== "DENY" && v.suggested > 0);
  return {
    caseId: c.id, scamType: c.scamType, complaints,
    requests: {
      count: accts.length, whole: accts.filter((v) => !("amount" in v.asked)).length, unsigned: accts.filter((v) => !v.request.signed).length,
      stations: new Set(accts.map((v) => v.request.issuer.station)).size, asked,
    },
    calls: c.calls.length,
    spoofed: c.shownCallers.filter((s) => s.spoofed).map((s) => ({ shown: s.msisdn, owner: s.owner, protected: s.protected })),
    devices, hops, movedOut: c.movedOut, catchable: c.catchable, scored,
    verdict: {
      holdAccounts: holdable.length, hold: holdable.reduce((s, v) => s + v.suggested, 0), asked,
      routeBack: accts.filter((v) => v.gate.decision === "ROUTE").length,
      mules: accts.filter((v) => v.role === "mule").length, innocents: accts.filter((v) => v.role === "shield").length,
    },
    graph,
  };
}
