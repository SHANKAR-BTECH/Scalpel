/** Runs the rules engine's money trace for one case right now and reports what it found, hop by hop.
 *  The page then shows it at a pace a person can follow; `ms` is how long the engine really took. */
import { NextResponse } from "next/server";
import { trace } from "@scalpel/engine";
import { currentUser } from "@/lib/server/auth";
import { caseById, model, W } from "@/lib/server/world";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !["officer", "supervisor"].includes(u.role)) return NextResponse.json({ error: "Sign in as the fraud officer." }, { status: 401 });
  const c = caseById((await params).id);
  if (!c) return NextResponse.json({ error: "No such case." }, { status: 404 });
  const victimTxns = Object.fromEntries(c.complaints.map((k) => [k.txnId, k.victim]));
  const t0 = performance.now();
  const tr = trace({ opening: Object.fromEntries(W.accounts.map((a) => [a.id, a.opening])), txns: W.txns as never, victimTxns, asOf: W.now });
  const ms = performance.now() - t0;
  const m = model();
  const ours = new Set(c.accounts);
  const victims = new Set(c.complaints.map((k) => k.victim));
  const hops = new Map<number, { accounts: number; money: number }>();
  for (const id of ours) {
    const a = tr.accounts[id];
    if (!a) continue;
    const share = Object.entries(a.taint).reduce((s, [v, x]) => s + (victims.has(v) ? x : 0), 0);
    const h = Math.min(4, Math.max(1, m.accounts.get(id)?.hop ?? 1));
    const x = hops.get(h) ?? { accounts: 0, money: 0 };
    x.accounts++; x.money += share;
    hops.set(h, x);
  }
  const flows = tr.flows.filter((f) => ours.has(f.to) && Object.keys(f.taint).some((v) => victims.has(v))).length;
  return NextResponse.json({
    ms: Math.round(ms * 10) / 10, txnsRead: W.txns.length, flows,
    hops: [...hops.entries()].sort((a, b) => a[0] - b[0]).map(([h, x]) => ({ hop: h, ...x })),
    movedOut: c.movedOut, catchable: c.catchable,
  });
}
