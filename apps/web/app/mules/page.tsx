/** Every likely mule account across all cases, with the mule-score model's reasons and who it passed money to. */
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model, holderName, exitLabel, W } from "@/lib/server/world";
import { MuleBoard, type MuleRow, type Link as Flow } from "@/components/MuleBoard";
import { CountUp } from "@/components/CountUp";

const SIGN: Record<string, string> = {
  ACCOUNT_AGE_LT_30D: "new account", DWELL_LT_15M: "money leaves within 15 min", CALL_FORWARDING_ACTIVE: "call forwarding on", FRI_VERY_HIGH: "DoT fraud-risk very high",
  SIM_SWAP_LT_72H: "SIM swapped recently", MNRL_LISTED: "on revoked list", KYC_CHANGED_LT_30D: "KYC details changed this month", GE3_CASE_LINKED_SENDERS: "3+ reporting victims paid in", SIMBOX_ROUTE: "phone on a SIM-box route",
};

export default async function Mules() {
  await requireUser("officer", "supervisor", "auditor");
  const m = model();
  const d = await desk();
  const rows: MuleRow[] = [];
  for (const c of m.cases) {
    const name = (id: string, exit: boolean): { label: string; kind: Flow["kind"] } => {
      if (exit) return { label: exitLabel(id), kind: "exit" };
      if (id.startsWith("V:")) return { label: m.victimById.get(id.slice(2))?.name ?? "Victim", kind: "victim" };
      const v = m.accounts.get(id);
      return { label: v ? holderName(v.a) : id, kind: v?.role === "mule" ? "mule" : "account" };
    };
    const devices = c.rigs.map((r) => {
      const rig = W.rigs.find((x) => x.id === r);
      return rig ? `${rig.kind === "simbox" ? "SIM box" : "Handset"} ${rig.imei.slice(-4)}` : `SIM ${r.slice(-5)}`;
    });
    for (const id of c.accounts) {
      const v = m.accounts.get(id)!;
      if (v.role !== "mule" || !v.a.score) continue;
      const ins = c.edges.filter((e) => e.to === id).sort((a, b) => b.amount - a.amount).slice(0, 5).map((e) => ({ ...name(e.from, false), amount: e.amount }));
      const outs = c.edges.filter((e) => e.from === id).sort((a, b) => b.amount - a.amount).slice(0, 5).map((e) => ({ ...name(e.to, e.exit), amount: e.amount }));
      rows.push({
        id, name: holderName(v.a), caseId: c.id, scamType: c.scamType, layer: v.hop ?? 1, score: v.a.score.muleScore, reasons: v.a.score.reasons.slice(0, 3),
        traced: v.traced, received: v.received, balance: v.balance, type: v.a.type, city: v.a.holder.city,
        phone: v.phone?.msisdn ?? null, signs: v.a.signals.map((s) => SIGN[s]).filter(Boolean) as string[], devices,
        status: d.holdByAccount.has(id) ? "held" : d.pendingByAccount.has(id) ? "pending" : null, ins, outs,
      });
    }
  }
  rows.sort((a, b) => b.traced - a.traced);
  const still = rows.reduce((s, r) => s + r.traced, 0);
  const through = rows.reduce((s, r) => s + r.received, 0);
  const cases = new Set(rows.map((r) => r.caseId)).size;
  return (
    <div>
      <p className="eyebrow">Mules · {W.bank.name}</p>
      <h1 className="mt-1">{rows.length} accounts that look rented out to pass scam money</h1>
      <p className="mt-1 max-w-[860px] muted">The mule-score model gives every account on a trail a score from 0 to 100 using 17 clues. These are the ones above 50, across every case. Pick one to see who sent it money and where the money went next.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4"><p className="text-[12.5px] muted">Likely mule accounts</p><p className="money text-[26px]"><CountUp value={rows.length} /></p></div>
        <div className="card p-4"><p className="text-[12.5px] muted">Victims&apos; money that passed through them</p><p className="money text-[26px]"><CountUp value={through} format="inrShort" /></p></div>
        <div className="card p-4"><p className="text-[12.5px] muted">Still sitting in them</p><p className="money text-[26px] text-[var(--accent)]"><CountUp value={still} format="inrShort" /></p></div>
        <div className="card p-4"><p className="text-[12.5px] muted">Cases they appear in</p><p className="money text-[26px]"><CountUp value={cases} /></p></div>
      </div>
      <div className="mt-5"><MuleBoard rows={rows} /></div>
    </div>
  );
}
