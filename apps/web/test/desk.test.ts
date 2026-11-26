// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { verifyChain } from "@scalpel/engine";
import { MemoryStore, PgStore, useStore, type Store } from "@/lib/server/store";
import { decide, desk, holderReply, moveClock, phoneTarget, proposeHold, proposeRelease, telcoAct, uploadGrievance, DeskError } from "@/lib/server/desk";
import { model, W } from "@/lib/server/world";
import { userById } from "@/lib/users";

const priya = userById("priya")!, vikram = userById("vikram")!, imran = userById("imran")!, asha = userById("asha")!;
const target = () => [...model().accounts.values()].find((v) => v.traced > 500_000 && v.role === "mule")!;

async function flow() {
  const v = target();
  await proposeHold(priya, v.a.id, v.traced, "exact traced amount");
  await expect(proposeHold(priya, v.a.id, v.traced, "again")).rejects.toThrow(DeskError);
  let d = await desk();
  const p = d.proposals[0]!;
  await expect(decide(priya, p.pid, true, "")).rejects.toThrow(/supervisor/);
  await decide(vikram, p.pid, true, "ok");
  await expect(decide(vikram, p.pid, true, "twice")).rejects.toThrow(/already decided/);
  d = await desk();
  const h = d.holds[0]!;
  expect(h.hold.amount).toBe(v.traced);
  expect(h.ref).toMatch(/^H-\d{5}$/);
  await holderReply(h.ref, "This was payment for a blouse order from a customer.", "order-book.jpg");
  await uploadGrievance(priya, h.hold.id);
  await moveClock(asha, 7);
  d = await desk();
  const io = d.holds[0]!.clocks.find((c) => c.clock.id === "io_decision")!;
  expect(io.state).toBe("RUNNING");
  await proposeRelease(priya, h.hold.id, "IO agreed");
  d = await desk();
  await decide(vikram, d.proposals.at(-1)!.pid, true, "");
  d = await desk();
  expect(d.holds[0]!.hold.state).toBe("RELEASED");
  expect((await verifyChain(d.chain)).ok).toBe(true);
}

describe("desk on the memory store", () => {
  beforeEach(() => useStore(new MemoryStore()));
  it("propose, approve (two people), notify, reply, release", flow);
  it("never holds more than the traced money", async () => {
    const v = target();
    await expect(proposeHold(priya, v.a.id, v.traced + 1, "")).rejects.toThrow(/can't be more/);
  });
});

describe("desk on Postgres (PGlite)", () => {
  let s: Store;
  beforeEach(async () => { const db = new PGlite(); s = new PgStore(async (q, p) => (await db.query(q, p as unknown[])).rows as Record<string, unknown>[]); useStore(s); });
  it("same flow on a real SQL database", flow);
  it("two supervisors clicking at once give one decision", async () => {
    const v = target();
    await proposeHold(priya, v.a.id, v.traced, "");
    const pid = (await desk()).proposals[0]!.pid;
    const r = await Promise.allSettled([decide(vikram, pid, true, ""), decide(vikram, pid, true, "")]);
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect((await desk()).holds.length).toBe(1);
  });
  it("a second server sees new records and a reset made elsewhere", async () => {
    const db = new PGlite();
    const q = async (t: string, p?: unknown[]) => (await db.query(t, p as unknown[])).rows as Record<string, unknown>[];
    const a = new PgStore(q), b = new PgStore(q);
    const draft = (n: number) => ({ at: n, actor: "priya", type: "NOTE", caseId: "CASE-001", payload: { n } });
    await a.append([draft(1), draft(2)]);
    expect((await b.chain()).length).toBe(2);
    await a.append([draft(3)]);
    expect((await b.chain()).map((e) => e.at)).toEqual([1, 2, 3]);
    await a.reset();
    await a.append([draft(7), draft(8), draft(9)]);
    const seen = await b.chain();
    expect(seen.map((e) => e.at)).toEqual([7, 8, 9]);
    expect((await verifyChain(seen)).ok).toBe(true);
  });
});

describe("telecom rules", () => {
  beforeEach(() => useStore(new MemoryStore()));
  it("blocks the SIM box handset but refuses spoofed and protected numbers", async () => {
    const rig = W.rigs.find((r) => r.sims.length === 47)!;
    expect(phoneTarget("IMEI", rig.imei, W.now).refusal).toEqual([]);
    expect(phoneTarget("MSISDN", W.spoofedOwners[0]!.msisdn, W.now).refusal.join(" ")).toMatch(/spoofed/);
    expect(phoneTarget("MSISDN", W.protectedNumbers[0]!.msisdn, W.now).refusal.join(" ")).toMatch(/registered businesses/);
    const msg = await telcoAct(imran, "IMEI", rig.imei);
    expect(msg.message).toMatch(/blocked/);
  });
});

import { decideAccount, signoff, tamperTest } from "@/lib/server/desk";
import { aiView } from "@/lib/server/judge";
import { START } from "@/lib/server/world";
import { saveTrail } from "@/lib/server/desk";
import { checkTrail } from "@/lib/server/trailcheck";
import type { TrailPin } from "@/lib/trail";

/** Every pin an officer could make on a case: each victim's payment and every move that carries their money. */
function fullPins(caseId: string): TrailPin[] {
  const m = model(), c = m.cases.find((x) => x.id === caseId)!;
  const vs = new Set(c.complaints.map((x) => x.victim));
  const carries = (t: Record<string, number>) => Object.entries(t).some(([k, p]) => vs.has(k) && p > 0);
  return [
    ...c.complaints.map((x) => ({ kind: "payment" as const, ref: x.txnId, label: x.txnId })),
    ...m.trace.flows.filter((f) => carries(f.taint) && m.accounts.has(f.to)).map((f) => ({ kind: "move" as const, ref: f.txnId, label: f.txnId })),
  ];
}
async function onTrail(account: string) {
  const caseId = model().caseOfAccount.get(account)!;
  await saveTrail(priya, caseId, fullPins(caseId), {}, "");
}

describe("person and AI decide together", () => {
  beforeEach(() => useStore(new MemoryStore()));
  const meera = userById("meera")!;
  const all = () => [...model().accounts.values()];
  it("an agreed hold becomes a proposal for the supervisor", async () => {
    const v = all().find((x) => aiView(x, START).suggest === "HOLD" && x.traced > 1000_00)!;
    await onTrail(v.a.id);
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    const d = await desk();
    expect(d.decisionByAccount.get(v.a.id)!.agreed).toBe(true);
    expect(d.pendingByAccount.get(v.a.id)!.amount).toBe(aiView(v, START).amount);
    await expect(decideAccount(priya, v.a.id, "NO_HOLD", "Other", "twice over")).rejects.toThrow(/already/);
  });
  it("overruling a confident AI needs sign-off, and a send-back reopens the account", async () => {
    const v = all().find((x) => { const ai = aiView(x, START); return ai.suggest === "HOLD" && ai.confidence >= 0.8; })!;
    await onTrail(v.a.id);
    await decideAccount(priya, v.a.id, "NO_HOLD", "Long-standing account with normal history", "");
    let d = await desk();
    const dec = d.decisionByAccount.get(v.a.id)!;
    expect(dec.needsSignoff).toBe(true);
    await expect(signoff(priya, dec.did, true, "")).rejects.toThrow(/supervisor/);
    await expect(signoff(vikram, dec.did, false, "")).rejects.toThrow(/why/);
    await signoff(vikram, dec.did, false, "Score is 99/100 and money left in minutes");
    d = await desk();
    expect(d.decisionByAccount.has(v.a.id)).toBe(false);
    expect(d.returned.get(v.a.id)!.signoff!.note).toMatch(/minutes/);
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    expect((await desk()).decisionByAccount.get(v.a.id)!.agreed).toBe(true);
  });
  it("refuses a hold on a police request that can't be used", async () => {
    const v = all().find((x) => x.gate.decision === "ROUTE")!;
    await onTrail(v.a.id);
    await expect(decideAccount(priya, v.a.id, "HOLD", "Other", "hold anyway")).rejects.toThrow(/can't be used/);
    await decideAccount(priya, v.a.id, "SEND_BACK", "Police request can't be used as it is", "");
  });
  it("the tamper test catches a changed entry and leaves the record alone", async () => {
    const v = all().find((x) => aiView(x, START).suggest === "HOLD" && x.traced > 1000_00)!;
    await onTrail(v.a.id);
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    const before = (await desk()).chain.map((e) => e.hash).join();
    const r = await tamperTest(meera);
    expect(r.row).toBeTypeOf("number");
    expect((await desk()).chain.map((e) => e.hash).join()).toBe(before);
    expect((await verifyChain((await desk()).chain)).ok).toBe(true);
  });
});

import { telcoDecide, policePacket, saveTrace } from "@/lib/server/desk";
import { alerts, traceView } from "@/lib/server/telco";
import { T } from "@/lib/server/telcodata";
import { checkTrace } from "@/lib/server/tracecheck";
import type { PinRef } from "@/lib/pins";

const pin = (kind: PinRef["kind"], ref: string): PinRef => ({ kind, ref, label: ref });
/** What an engineer pins on RIG-1 to bar its handset: the handset, its SIMs, its call statistics and its tower. */
const rigPins = () => { const r = W.rigs[0]!; return [pin("handset", r.imei), pin("sims", r.imei), pin("stats", `${r.imei}||`), pin("tower", r.cell)]; };
const bizPins = () => {
  const a = alerts().find((x) => x.id === "BIZ-1")!;
  const sim = T.attach.find((x) => x.imei === a.value)!.msisdn;
  return [pin("handset", a.value), pin("dlt", sim), pin("stats", `${a.value}||`)];
};

describe("Telco-A analyst decides with its AI", () => {
  beforeEach(() => useStore(new MemoryStore()));
  it("reporting a SIM box to DoT raises the linked mule phones and updates the bank's AI", async () => {
    const a = alerts().find((x) => x.id === "RIG-1")!;
    expect(a.linked.length).toBeGreaterThan(0);
    const l = a.linked.find((x) => aiView(model().accounts.get(x.account)!, START).suggest === "HOLD")!;
    const v = model().accounts.get(l.account)!;
    const before = aiView(v, START);
    expect(before.clash ?? "").toMatch(/rating is Low/);
    await expect(telcoDecide(priya, a.id, "BAR_IMEI", "Signals match the suggestion", "", true)).rejects.toThrow(/Telco-A analyst/);
    await expect(telcoDecide(imran, a.id, "BAR_IMEI", "Signals match the suggestion", "", true)).rejects.toThrow(/save your trace/);
    await saveTrace(imran, a.id, rigPins().slice(0, 1), [], "");
    await expect(telcoDecide(imran, a.id, "BAR_IMEI", "Signals match the suggestion", "", true)).rejects.toThrow(/Still missing/);
    await saveTrace(imran, a.id, rigPins(), ["tick-many"], "");
    const r = await telcoDecide(imran, a.id, "BAR_IMEI", "Would cut off genuine customers", "route has 2 business lines", true);
    expect(r.message).toMatch(/Reported to DoT/);
    const d = await desk();
    expect(d.telcoByAlert.get(a.id)!.agreed).toBe(false); // AI said block the route
    expect(d.fri.get(l.msisdn)!.band).toBe("HIGH");
    const after = aiView(v, d.now, d.fri.get(l.msisdn)!.band);
    expect(after.update).toMatch(/DoT raised/);
    expect(after.clash ?? "").not.toMatch(/rating is Low/);
    await expect(telcoDecide(imran, a.id, "BAR_IMEI", "Signals match the suggestion", "", true)).rejects.toThrow(/already/);
    expect(d.telcoByAlert.get(a.id)!.trace).toEqual({ version: 2, hash: d.traces.get(a.id)!.hash });
    await expect(saveTrace(imran, a.id, rigPins().slice(0, 2), [], "")).rejects.toThrow(/locked/);
  });
  it("saved traces are versioned, re-checked on the server, and only Telco-A saves them", async () => {
    await expect(saveTrace(priya, "RIG-1", rigPins(), [], "")).rejects.toThrow(/Telco-A/);
    await expect(saveTrace(imran, "RIG-1", [], [], "")).rejects.toThrow(/Pin something/);
    await saveTrace(imran, "RIG-1", rigPins(), [], "");
    await expect(saveTrace(imran, "RIG-1", rigPins(), [], "")).rejects.toThrow(/Nothing changed/);
    // A pin from another alert's handset is flagged and counts for nothing.
    const other = [...rigPins(), pin("handset", W.rigs[1]!.imei)];
    const r = await saveTrace(imran, "RIG-1", other, [], "");
    expect(r.version).toBe(2);
    const c = checkTrace("RIG-1", (await desk()).traces.get("RIG-1")!.pins);
    expect(c.offAlert).toHaveLength(1);
    expect(c.actions.find((x) => x.action === "BAR_IMEI")!.ready).toBe(true);
    // Junk from the browser is dropped.
    const junk = await saveTrace(imran, "RIG-2", [{ kind: "nope", ref: "x" }, { kind: "handset", ref: W.rigs[1]!.imei, label: 5 }, "str"], [7 as unknown as string], "");
    expect((await desk()).traces.get("RIG-2")!.pins).toEqual([pin("handset", W.rigs[1]!.imei)]);
    expect(junk.version).toBe(1);
  });
  it("the check never names the answer, and a trap needs its own evidence", () => {
    const c = checkTrace("RIG-1", rigPins());
    expect(JSON.stringify(c)).not.toMatch(/recommend|correct|right answer/i);
    const fwd = checkTrace("FWD-1", []);
    expect(fwd.actions.every((x) => !x.ready)).toBe(true);
    // A forged "police letter" pin on a SIM-box SIM (no letter on file) counts for nothing.
    const sim = T.attach.find((x) => x.imei === W.rigs[0]!.imei)!.msisdn;
    const forged = checkTrace("RIG-1", [...rigPins(), pin("police", sim)]);
    expect(forged.empty).toHaveLength(1);
    expect(forged.actions.find((x) => x.action === "KEEP_LIVE")?.ready ?? false).toBe(false);
  });
  it("a lookalike is never reported, and call records go only to police", async () => {
    await saveTrace(imran, "BIZ-1", bizPins(), [], "");
    await telcoDecide(imran, "BIZ-1", "GENUINE", "Registered business traffic", "", true);
    expect((await desk()).fri.size).toBe(0);
    await expect(policePacket(imran, "BIZ-1")).rejects.toThrow(/stay with Telco-A/);
    await expect(policePacket(imran, "RIG-1")).rejects.toThrow(/Save a trace/);
    await saveTrace(imran, "RIG-1", rigPins(), [], "");
    const r = await policePacket(imran, "RIG-1");
    expect(r.message).toMatch(/bank does not receive/);
    await expect(policePacket(imran, "RIG-1")).rejects.toThrow(/already/);
  });
  it("every alert can be solved from its own records", async () => {
    const { EXPECTED, alertById } = await import("@/lib/server/telco");
    for (const a of alerts()) {
      const sims = a.kind === "IMEI" ? T.attach.filter((x) => x.imei === a.value).map((x) => x.msisdn) : [a.value];
      const imeis = a.kind === "IMEI" ? [a.value] : T.attach.filter((x) => x.msisdn.replace(/\D/g, "").endsWith(a.value.replace(/\D/g, "").slice(-10))).map((x) => x.imei);
      const n = sims[0]!;
      const pins: PinRef[] = [
        ...imeis.flatMap((i) => [pin("handset", i), pin("sims", i), pin("stats", `${i}||`)]),
        ...["number", "sim", "spoof", "police", "dlt", "chakshu", "swap", "forwarding"].map((k) => pin(k as PinRef["kind"], n)),
        pin("stats", `${n}||`),
        ...T.routes.filter((r) => r.devices.some((d) => imeis.includes(d))).map((r) => pin("route", r.id)),
        ...(alertById(a.id)!.kind === "IMEI" ? [] : []),
      ];
      const cells = new Set((await import("@/lib/server/telcodata")).I().calls.filter((c) => imeis.includes(c.imei) || c.from.replace(/\D/g, "").endsWith(n.replace(/\D/g, "").slice(-10))).map((c) => c.cell));
      for (const c of cells) pins.push(pin("tower", c));
      const want = checkTrace(a.id, pins).actions.find((x) => x.action === EXPECTED[a.id]);
      expect(want, a.id).toBeTruthy();
      expect(want!.missing, a.id).toEqual([]);
    }
  });
  it("every alert has a trace to draw", () => {
    for (const a of alerts()) {
      const t = traceView(a);
      expect(t.sims.length).toBeGreaterThan(0);
      expect(t.people.length).toBeGreaterThan(0);
      expect(t.log).toHaveLength(6);
    }
  });
});

import { resetDemo } from "@/lib/server/desk";
import { cleanTrail } from "@/lib/server/trailcheck";
import * as B from "@/lib/server/bank";

describe("Priya builds the money trail herself", () => {
  beforeEach(() => useStore(new MemoryStore()));
  const c1 = () => model().cases[0]!;
  const vsOf = (id: string) => new Set(model().cases.find((c) => c.id === id)!.complaints.map((x) => x.victim));
  const shareIn = (id: string, t: Record<string, number>) => { const vs = vsOf(id); return Object.entries(t).reduce((s, [k, p]) => s + (vs.has(k) ? p : 0), 0); };
  /** What a careful officer pins: every payment, every move and every cash-out worth at least the Rs 1,000 minimum. */
  const careful = (id: string): TrailPin[] => {
    const m = model();
    const big = (t: Record<string, number>) => shareIn(id, t) >= 1000_00;
    return [
      ...fullPins(id).filter((p) => p.kind === "payment" || big((m.trace.flows.find((f) => f.txnId === p.ref) ?? { taint: {} }).taint)),
      ...m.trace.exits.filter((x) => big(x.taint)).map((x) => ({ kind: (m.accounts.has(x.to) ? "move" : "gone") as TrailPin["kind"], ref: x.txnId, label: x.txnId })),
    ];
  };

  it("no decision without a saved trail that reaches the account", async () => {
    const v = model().accounts.get(c1().accounts[0]!)!;
    await expect(decideAccount(priya, v.a.id, "NO_HOLD", "Other", "no trail yet")).rejects.toThrow(/trail workbench/);
  });

  it("reset seeds a half-built trail on CASE-001: two payments, two accounts reached", async () => {
    await resetDemo(userById("asha")!);
    const t = (await desk()).trails.get(c1().id)!;
    expect(t.version).toBe(1);
    expect(t.pins.map((p) => p.kind)).toEqual(["payment", "payment"]);
    expect(t.reached.length).toBeGreaterThanOrEqual(1);
  });

  it("a careful trail accounts for every rupee (within 0.1%)", () => {
    for (const c of model().cases.slice(0, 6)) {
      const r = checkTrail(c.id, careful(c.id), {});
      expect(r.offCase).toEqual([]);
      expect(r.unpaid.count).toBe(0);
      expect(r.balance.notFound).toBe(0);
      const sum = r.balance.inAccounts + r.balance.gone + r.balance.small;
      expect(Math.abs(sum - r.balance.reported)).toBeLessThan(r.balance.reported * 0.001);
      expect(r.balance.small).toBeLessThan(r.balance.reported * 0.1);
    }
  });

  it("missing money is named by account and amount, never by row", () => {
    const c = c1();
    const pays = c.complaints.map((x) => ({ kind: "payment" as const, ref: x.txnId, label: x.txnId }));
    const r = checkTrail(c.id, pays, {});
    expect(r.unpaid.count).toBe(0);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.balance.notFound).toBe(r.missing.reduce((s, x) => s + x.amount, 0));
    const text = JSON.stringify(r);
    for (const f of model().trace.flows.filter((f) => r.reached.includes(f.from))) expect(text).not.toContain(f.txnId);
  });

  it("pins that carry no victim money, or come from another case, are flagged", () => {
    const c = c1(), other = model().cases[1]!;
    const first = model().accounts.get(W.txns.find((t) => t.id === c.complaints[0]!.txnId)!.to)!;
    const before = W.txns.find((t) => t.from === first.a.id && t.at < W.txns.find((x) => x.id === c.complaints[0]!.txnId)!.at && !model().trace.flows.some((f) => f.txnId === t.id && shareIn(c.id, f.taint) > 0) && !model().trace.exits.some((f) => f.txnId === t.id && shareIn(c.id, f.taint) > 0));
    const pins: TrailPin[] = [
      { kind: "payment", ref: c.complaints[0]!.txnId, label: "mine" },
      { kind: "payment", ref: other.complaints[0]!.txnId, label: "other case" },
      ...(before ? [{ kind: "gone" as const, ref: before.id, label: "before the scam" }] : []),
      { kind: "move", ref: "TP9999999", label: "made up" },
    ];
    const r = checkTrail(c.id, pins, {});
    expect(r.offCase.length).toBe(before ? 3 : 2);
    expect(r.reached).toEqual([first.a.id]);
  });

  it("holds are compared with the traced money, and a decision uses her hold", async () => {
    const c = c1();
    const pins = careful(c.id);
    const v = [...model().accounts.values()].find((x) => c.accounts.includes(x.a.id) && aiView(x, START).suggest === "HOLD" && x.traced > 5000_00)!;
    const r = checkTrail(c.id, pins, { [v.a.id]: v.traced * 2 });
    expect(r.holds.find((h) => h.account === v.a.id)!.verdict).toBe("above");
    expect(checkTrail(c.id, pins, { [v.a.id]: Math.round(v.traced / 2) }).holds.find((h) => h.account === v.a.id)!.verdict).toBe("below");
    expect(checkTrail(c.id, pins, { [v.a.id]: v.traced }).holds.find((h) => h.account === v.a.id)!.verdict).toBe("matches");
    const mine = Math.max(1000_00, Math.round(aiView(v, START).amount * 0.95 / 100) * 100);
    await saveTrail(priya, c.id, pins, { [v.a.id]: mine }, "full trail");
    await expect(decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "", aiView(v, START).amount + 100_00)).rejects.toThrow(/more than/);
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    const d = await desk();
    expect(d.pendingByAccount.get(v.a.id)!.amount).toBe(mine);
    const dec = d.decisionByAccount.get(v.a.id)! as unknown as { trail: { version: number; hash: string } };
    expect(dec.trail.version).toBe(1);
  });

  it("trails are versioned, only the officer saves, and the browser can't sneak in junk", async () => {
    const c = c1();
    const pins = careful(c.id).slice(0, 5);
    await expect(saveTrail(vikram, c.id, pins, {}, "")).rejects.toThrow(/fraud officer/);
    await saveTrail(priya, c.id, pins, {}, "");
    await expect(saveTrail(priya, c.id, pins, {}, "")).rejects.toThrow(/Nothing changed/);
    await saveTrail(priya, c.id, careful(c.id).slice(0, 8), {}, "");
    expect((await desk()).trails.get(c.id)!.version).toBe(2);
    const junk = cleanTrail([{ kind: "hack", ref: "x" }, { kind: "move", ref: "A".repeat(99) }, null, { kind: "gone", ref: "TP1", label: 5 }], { P00157: -5, P1: 100, P00158: 1.5, P00159: 500_00 });
    expect(junk.pins).toEqual([{ kind: "gone", ref: "TP1", label: "TP1" }]);
    expect(junk.holds).toEqual({ P00159: 500_00 });
  });

  it("the bank's statement reads like a real one and never marks victims' money", () => {
    const c = c1();
    const pay = B.payment(c.complaints[0]!.txnId);
    expect(pay.found).toBe(true);
    if (!pay.found) return;
    const st = B.statement(pay.to, null, null);
    expect(st.found).toBe(true);
    if (!st.found) return;
    let bal = st.opening;
    for (const r of st.rows) { bal += r.dir === "in" ? r.amount : -r.amount; expect(r.balance).toBe(bal); expect(r.narration.length).toBeGreaterThan(5); }
    expect(JSON.stringify(st)).not.toMatch(/taint|victim/i);
    expect(B.payment("nope").found).toBe(false);
    const k = B.kyc(pay.to);
    expect(k.found && k.request.id).toBeTruthy();
  });
});
