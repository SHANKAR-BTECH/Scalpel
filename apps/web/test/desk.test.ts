// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { verifyChain } from "@scalpel/engine";
import { MemoryStore, PgStore, useStore, type Store } from "@/lib/server/store";
import { decide, desk, holderReply, moveClock, phoneTarget, proposeHold, proposeRelease, telcoAct, uploadGrievance, DeskError } from "@/lib/server/desk";
import { model, W } from "@/lib/server/world";
import { userById } from "@/lib/users";

const CHECKED = { checks: ["path", "amount", "police", "impact"], spot: null, seconds: 45, code: "" };
const priya = userById("priya")!, vikram = userById("vikram")!, imran = userById("imran")!, asha = userById("asha")!;
const target = () => [...model().accounts.values()].find((v) => v.traced > 500_000 && v.role === "mule")!;

async function flow() {
  const v = target();
  await proposeHold(priya, v.a.id, v.traced, "exact traced amount");
  await expect(proposeHold(priya, v.a.id, v.traced, "again")).rejects.toThrow(DeskError);
  let d = await desk();
  const p = d.proposals[0]!;
  await expect(decide(priya, p.pid, true, "")).rejects.toThrow(/supervisor/);
  await expect(decide(vikram, p.pid, true, "no checks")).rejects.toThrow(/Check all four/);
  await decide(vikram, p.pid, true, "ok", CHECKED);
  await expect(decide(vikram, p.pid, true, "twice", CHECKED)).rejects.toThrow(/already decided/);
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
    const r = await Promise.allSettled([decide(vikram, pid, true, "", CHECKED), decide(vikram, pid, true, "", CHECKED)]);
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
import { checkTrace, checkCall, pinKey } from "@/lib/server/tracecheck";
import type { TAction } from "@/lib/server/telco";
/** A careful analyst's form: cite the pins that don't argue against the call, and answer each one that does. */
const commit = (alert: string, pins: PinRef[], act: TAction) => {
  const m = checkTrace(alert, pins).pins;
  const cite = m.filter((x) => !x.against.includes(act) && x.positive).map((x) => x.key);
  const sup = m.find((x) => x.for.includes(act));
  const answers = Object.fromEntries(m.filter((x) => x.against.includes(act)).map((x) => [x.key, sup?.key ?? ""]));
  return { cite, answers };
};
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
    await saveTrace(imran, a.id, rigPins(), ["many"], "");
    await expect(telcoDecide(imran, a.id, "BAR_IMEI", "Would cut off genuine customers", "", true)).rejects.toThrow(/Tick the pins/);
    const r = await telcoDecide(imran, a.id, "BAR_IMEI", "Would cut off genuine customers", "route has 2 business lines", true, { ...commit(a.id, rigPins(), "BAR_IMEI"), second: "Ritu Sharma, shift lead" });
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
    expect(forged.empty).toHaveLength(0); // a "no letter" pin is a finding, and it backs nothing
    expect(forged.pins.find((x) => x.kind === "police")!.positive).toBe(false);
    expect(forged.actions.find((x) => x.action === "KEEP_LIVE")?.ready ?? false).toBe(false);
  });
  it("a lookalike is never reported, and call records go only to police", async () => {
    await saveTrace(imran, "BIZ-1", bizPins(), [], "");
    await telcoDecide(imran, "BIZ-1", "GENUINE", "Registered business traffic", "", true, commit("BIZ-1", bizPins(), "GENUINE"));
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
        ...["number", "sim", "spoof", "police", "dlt", "chakshu", "swap", "forwarding", "bulk"].map((k) => pin(k as PinRef["kind"], n)),
        pin("stats", `${n}||`),
        ...T.routes.filter((r) => r.devices.some((d) => imeis.includes(d))).map((r) => pin("route", r.id)),
        ...(alertById(a.id)!.kind === "IMEI" ? [] : []),
      ];
      const cells = new Set((await import("@/lib/server/telcodata")).I().calls.filter((c) => imeis.includes(c.imei) || c.from.replace(/\D/g, "").endsWith(n.replace(/\D/g, "").slice(-10))).map((c) => c.cell));
      for (const c of cells) pins.push(pin("tower", c));
      const want = checkTrace(a.id, pins).actions.find((x) => x.action === EXPECTED[a.id]);
      expect(want, a.id).toBeTruthy();
      expect(want!.missing, a.id).toEqual([]);
      // ...and a careful analyst can commit to it: cite what supports it, answer what argues against it.
      const k = commit(a.id, pins, EXPECTED[a.id]!);
      expect(checkCall(a.id, pins, EXPECTED[a.id]!, k.cite, k.answers).problems, a.id).toEqual([]);
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

describe("Imran's signs come from his clues", () => {
  it("no clue, no sign; the handset and its records show the SIM box", () => {
    expect(checkTrace("RIG-1", []).signals.every((x) => !x.seen)).toBe(true);
    const r = checkTrace("RIG-1", rigPins());
    expect(r.signals.find((x) => x.key === "many")!.seen).toBe(true);
    expect(r.signals.find((x) => x.key === "many")!.why).toMatch(/\d+ SIMs/);
    expect(r.signals.find((x) => x.key === "owner")!.seen).toBe(false);
  });
});

import { holdReview, spotAnswer } from "@/lib/server/review";
import { holderName } from "@/lib/server/world";

describe("Vikram checks the evidence before approving", () => {
  beforeEach(() => useStore(new MemoryStore()));
  async function proposed() {
    const c = model().cases[0]!;
    const v = [...model().accounts.values()].find((x) => c.accounts.includes(x.a.id) && aiView(x, START).suggest === "HOLD" && x.traced > 5000_00)!;
    await saveTrail(priya, c.id, fullPins(c.id), {}, "");
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    const d = await desk();
    return { d, pid: d.pendingByAccount.get(v.a.id)!.pid, v };
  }
  it("shows the path back to a victim, the pinned rows, and a spot-check whose answer stays on the server", async () => {
    const { d, pid, v } = await proposed();
    const r = holdReview(d, pid)!;
    expect(r.path.at(-1)!.to).toBe(holderName(v.a));
    expect(r.path[0]!.kind).toBe("payment");
    expect(r.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain('"expected"');
    if (r.spot) {
      const ans = spotAnswer(d, pid)!;
      expect(Math.abs(Math.round((r.spot.amount * r.spot.victimBefore) / r.spot.balanceBefore) - ans)).toBeLessThanOrEqual(100);
    }
  });
  it("approve needs all four checks and the spot-check; a wrong answer needs a note; send back needs a reason", async () => {
    const { d, pid, v } = await proposed();
    const ans = spotAnswer(d, pid);
    await expect(decide(vikram, pid, true, "", { ...CHECKED, checks: ["path", "amount"] })).rejects.toThrow(/police request, holder impact/);
    if (ans !== null) {
      await expect(decide(vikram, pid, true, "", CHECKED)).rejects.toThrow(/spot-check/);
      await expect(decide(vikram, pid, true, "", { ...CHECKED, spot: ans + 5000_00 })).rejects.toThrow(/doesn't match/);
    }
    await expect(decide(vikram, pid, false, "", { ...CHECKED, code: "" })).rejects.toThrow(/sending it back/);
    await decide(vikram, pid, true, "", { ...CHECKED, spot: ans });
    const p = (await desk()).proposals.find((x) => x.pid === pid)!;
    expect(p.status).toBe("approved");
    expect(p.review!.checks.length).toBe(4);
    if (ans !== null) expect(p.review!.spot!.ok).toBe(true);
    expect((await desk()).holdByAccount.has(v.a.id)).toBe(true);
  });
  it("sending back reopens the account for the officer with the reason", async () => {
    const { pid, v } = await proposed();
    await decide(vikram, pid, false, "check the second hop", { ...CHECKED, code: "Amount doesn't match the trail" });
    const d = await desk();
    expect(d.decisionByAccount.has(v.a.id)).toBe(false);
    expect(d.returned.get(v.a.id)!.signoff!.note).toMatch(/Amount doesn't match the trail: check the second hop/);
  });
});

import { telcoGroup, telcoShop } from "@/lib/server/desk";
import { sisters, protectedReason, blast } from "@/lib/server/telcogroup";

describe("Imran works beyond one alert: linked SIMs, the shop, who else gets cut off", () => {
  beforeEach(() => useStore(new MemoryStore()));
  const rig3 = () => W.rigs.find((r) => r.id === "RIG-3")!;
  const owner = T.subscribers.find((s) => s.kycName === "Lakshmi Kumari")!;
  const anchor = () => rig3().sims.map((s) => s.msisdn).find((n) => T.subscribers.find((x) => x.msisdn === n)?.kycDoc === owner.kycDoc)!;

  it("the linked-SIM hunt finds the real owner of the stolen ID, over DoT's limit", () => {
    const g = sisters(anchor());
    expect(g.found).toBe(true);
    expect(g.docCount).toBeGreaterThan(9);
    expect(g.overLimit).toBe(true);
    expect(g.rows.some((r) => r.msisdn === owner.msisdn && r.why.includes("same ID"))).toBe(true);
    expect(protectedReason(owner.msisdn)).toMatch(/long-time customer/);
    expect(protectedReason(anchor())).toBeNull();
    expect(checkTrace("RIG-3", [pin("group", anchor())]).signals.find((x) => x.key === "limit")!.seen).toBe(true);
  });

  it("a group block that sweeps up the owner is refused and logged; without her it goes through", async () => {
    const all = sisters(anchor()).rows.map((r) => r.msisdn);
    await expect(telcoGroup(imran, "RIG-3", anchor(), "BLOCK", all, "")).rejects.toThrow(/save a trace/i);
    await saveTrace(imran, "RIG-3", [pin("handset", rig3().imei), pin("group", anchor())], [], "");
    await expect(telcoGroup(imran, "RIG-3", anchor(), "BLOCK", [...all, "+91 99999 00000"], "")).rejects.toThrow(/not in this group/);
    await expect(telcoGroup(imran, "RIG-3", anchor(), "BLOCK", all, "")).rejects.toThrow(/1 of the ticked SIMs looks like a genuine customer/);
    let d = await desk();
    expect(d.groups.at(-1)!.outcome).toBe("REFUSED");
    expect(d.groups.at(-1)!.refused.join(" ")).toMatch(/Lakshmi Kumari/);
    const rest = all.filter((n) => n !== owner.msisdn);
    await telcoGroup(imran, "RIG-3", anchor(), "BLOCK", rest, "stolen ID, real owner left alone");
    await telcoGroup(imran, "RIG-3", anchor(), "LEAVE", [owner.msisdn], "her own SIM");
    d = await desk();
    expect(d.groups.filter((g) => g.outcome === "DONE").map((g) => g.action)).toEqual(["BLOCK", "LEAVE"]);
    await expect(telcoGroup(imran, "RIG-3", anchor(), "REVERIFY", rest.slice(0, 1), "")).rejects.toThrow(/already/);
  });

  it("a shop is suspended only on its own evidence; the enterprise desk never", async () => {
    const pos = T.subscribers.find((s) => s.msisdn === anchor())!.pos;
    await saveTrace(imran, "RIG-3", [pin("handset", rig3().imei), pin("shop", pos)], [], "");
    await expect(telcoShop(imran, "RIG-3", pos)).rejects.toThrow(/reused ID/);
    await saveTrace(imran, "RIG-3", [pin("handset", rig3().imei), pin("shop", pos), pin("doc", owner.kycDoc)], [], "");
    const r = await telcoShop(imran, "RIG-3", pos);
    expect(r.message).toMatch(/suspended/);
    await expect(telcoShop(imran, "RIG-3", pos)).rejects.toThrow(/already/);
    expect((await desk()).shops.map((x) => x.outcome)).toEqual(["REFUSED", "SUSPENDED"]);
  });

  it("shows who else gets cut off, and a route block with genuine lines needs a second person", async () => {
    const a = alerts().find((x) => x.id === "RIG-1")!;
    const b = blast(a, "BLOCK_ROUTE");
    expect(b.second).toBe(true);
    expect(b.lines.join(" ")).toMatch(/business line/);
    expect(b.lines.join(" ")).not.toMatch(/Hospital|Gramin/); // counts and kinds, never whose
    expect(blast(a, "BAR_IMEI").second).toBe(blast(a, "BAR_IMEI").genuine > 0);
    expect(blast(alerts().find((x) => x.id === "SIM-2")!, "DISCONNECT").second).toBe(true); // any step that cuts a genuine line
    expect(blast(alerts().find((x) => x.id === "SIM-2")!, "DISCONNECT").genuine).toBe(1);
    const r = T.routes.find((x) => x.devices.includes(a.value))!;
    await saveTrace(imran, a.id, [...rigPins(), pin("route", r.id)], [], "");
    const c = commit(a.id, [...rigPins(), pin("route", r.id)], "BLOCK_ROUTE");
    await expect(telcoDecide(imran, a.id, "BLOCK_ROUTE", "Signals match the suggestion", "", false, c)).rejects.toThrow(/second person/);
    await expect(telcoDecide(imran, a.id, "BLOCK_ROUTE", "Signals match the suggestion", "", false, { ...c, second: "Anyone at all" })).rejects.toThrow(/second person/);
    await telcoDecide(imran, a.id, "BLOCK_ROUTE", "Signals match the suggestion", "", false, { ...c, second: "Ritu Sharma, shift lead" });
    const t = (await desk()).telcoByAlert.get(a.id)!;
    expect(t.second).toBe("Ritu Sharma, shift lead");
    expect(t.cutOff).toBeGreaterThan(0);
  });
});

describe("Imran commits first: cited pins, answers to the pins against him, and traps no single rule beats", () => {
  beforeEach(() => useStore(new MemoryStore()));
  const num = (id: string) => alerts().find((x) => x.id === id)!.value;
  it("a pin that argues against a call can't be cited for it, and must be answered", () => {
    const sim = T.attach.find((x) => x.imei === num("BIZ-1"))!.msisdn;
    const pins = [pin("handset", num("BIZ-1")), pin("sims", num("BIZ-1")), pin("stats", `${num("BIZ-1")}||`), pin("tower", "TA-KA-0112"), pin("dlt", sim)];
    // Pinning everything opens both, but a bar can't rest on the sender registration.
    const all = pins.map(pinKey);
    const bar = checkCall("BIZ-1", pins, "BAR_IMEI", all, {});
    expect(bar.badCites.join(" ")).toMatch(/sender registration/i);
    expect(bar.ready).toBe(false);
    // Calling it genuine: the 24-SIM gateway argues against, and is answered with the registration.
    const gen = checkCall("BIZ-1", pins, "GENUINE", [pinKey(pins[4]!), pinKey(pins[2]!)], {});
    expect(gen.against.map((x) => x.label).join(" ")).toMatch(/Handset/);
    expect(gen.ready).toBe(false);
    expect(checkCall("BIZ-1", pins, "GENUINE", [pinKey(pins[0]!), pinKey(pins[4]!)], { [pinKey(pins[0]!)]: pinKey(pins[4]!) }).badCites).toHaveLength(1);
    const ok = checkCall("BIZ-1", pins, "GENUINE", [pinKey(pins[4]!), pinKey(pins[2]!)], { [pinKey(pins[0]!)]: pinKey(pins[4]!) });
    expect(ok.problems).toEqual([]);
    // An answer must be a pin that supports the call.
    expect(checkCall("BIZ-1", pins, "GENUINE", [pinKey(pins[4]!), pinKey(pins[2]!)], { [pinKey(pins[0]!)]: pinKey(pins[3]!) }).ready).toBe(false);
  });
  it("a 'no' is a finding: no police letter argues against keeping a line live", () => {
    const sim = T.attach.find((x) => x.imei === W.rigs[0]!.imei)!.msisdn;
    const c = checkTrace("RIG-1", [...rigPins(), pin("police", sim)]);
    expect(c.empty).toHaveLength(0);
    const m = c.pins.find((x) => x.kind === "police")!;
    expect(m.positive).toBe(false);
    expect(m.against).toContain("KEEP_LIVE");
    expect(c.shows.join(" ")).toMatch(/none on record/);
  });
  it("ABUSE-1: real papers and a real sender ID, but the reports say bank impersonation; the AI is right", async () => {
    const n = num("ABUSE-1");
    expect(alerts().find((x) => x.id === "ABUSE-1")!.ai.suggest).toBe("DISCONNECT");
    const pins = [pin("number", n), pin("stats", `${n}||`), pin("chakshu", n), pin("dlt", n), pin("bulk", n)];
    const c = checkTrace("ABUSE-1", pins);
    expect(c.actions.find((x) => x.action === "GENUINE")!.ready).toBe(true); // the tempting rule
    expect(c.actions.find((x) => x.action === "DISCONNECT")!.ready).toBe(true);
    const gen = checkCall("ABUSE-1", pins, "GENUINE", [pinKey(pins[0]!), pinKey(pins[3]!), pinKey(pins[1]!)], {});
    expect(gen.badCites.join(" ")).toMatch(/Call statistics/); // 2% incoming can't back "genuine"
    await saveTrace(imran, "ABUSE-1", pins, [], "");
    const k = commit("ABUSE-1", pins, "DISCONNECT");
    expect(Object.keys(k.answers).length).toBeGreaterThanOrEqual(2); // the registration and the papers both argue back
    await expect(telcoDecide(imran, "ABUSE-1", "DISCONNECT", "Signals match the suggestion", "", false, k)).rejects.toThrow(/second person/);
    await telcoDecide(imran, "ABUSE-1", "DISCONNECT", "Signals match the suggestion", "", false, { ...k, second: "Arjun Nair, senior analyst" });
    const t = (await desk()).telcoByAlert.get("ABUSE-1")!;
    expect(t.agreed).toBe(true);
    expect(t.answers.length).toBeGreaterThanOrEqual(2);
  });
  it("BULK-1: no sender registration, yet genuine on checked company papers; the AI is wrong", () => {
    const imei = num("BULK-1");
    const sim = T.attach.find((x) => x.imei === imei)!.msisdn;
    const noDlt = [pin("handset", imei), pin("stats", `${imei}||`), pin("dlt", sim)];
    expect(checkTrace("BULK-1", noDlt).actions.find((x) => x.action === "GENUINE")!.ready).toBe(false);
    const pins = [...noDlt, pin("bulk", sim)];
    const c = checkTrace("BULK-1", pins);
    expect(c.actions.find((x) => x.action === "GENUINE")!.ready).toBe(true);
    expect(c.pins.find((x) => x.kind === "stats")!.for).toContain("GENUINE"); // drivers call back
    const k = commit("BULK-1", pins, "GENUINE");
    expect(checkCall("BULK-1", pins, "GENUINE", k.cite, k.answers).ready).toBe(true);
  });
  it("a refused group action names no one, but the record keeps who for the audit", async () => {
    const r3 = W.rigs.find((r) => r.id === "RIG-3")!;
    const owner = T.subscribers.find((s) => s.kycName === "Lakshmi Kumari")!;
    const anchor = T.attach.find((x) => x.imei === r3.imei && T.subscribers.find((s) => s.msisdn === x.msisdn)?.kycDoc === owner.kycDoc)!.msisdn;
    await saveTrace(imran, "RIG-3", [pin("handset", r3.imei), pin("group", anchor)], [], "");
    const err = await telcoGroup(imran, "RIG-3", anchor, "BLOCK", sisters(anchor).rows.map((x) => x.msisdn), "").catch((e: Error) => e.message);
    expect(err).toMatch(/near miss/);
    expect(err).not.toMatch(/Lakshmi|94311/);
    expect((await desk()).groups[0]!.refused.join(" ")).toMatch(/Lakshmi/);
  });
});

import { caseProof, pickAnswer } from "@/lib/server/proof";
import { proofCheck, proofSign } from "@/lib/server/desk";

describe("The proof: harm counted both ways, re-checked by Meera", () => {
  beforeEach(() => useStore(new MemoryStore()));
  const meera = userById("meera")!;
  const c = () => model().cases[0]!;
  /** Priya's trail with the payments out pinned too, then up to 4 holds proposed and approved. */
  async function worked(fast = false) {
    const m = model(), vs = new Set(c().complaints.map((x) => x.victim));
    const carries = (t: Record<string, number>) => Object.entries(t).some(([k, p]) => vs.has(k) && p > 0);
    const outs = m.trace.exits.filter((x) => carries(x.taint) && m.accounts.has(x.from)).map((x) => ({ kind: "gone" as const, ref: x.txnId, label: x.txnId }));
    await saveTrail(priya, c().id, [...fullPins(c().id), ...outs], {}, "");
    const vsHold = [...m.accounts.values()].filter((x) => c().accounts.includes(x.a.id) && aiView(x, START).suggest === "HOLD").slice(0, 4);
    for (const v of vsHold) {
      await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
      const d = await desk();
      const pid = d.pendingByAccount.get(v.a.id)!.pid;
      await decide(vikram, pid, true, "", { ...CHECKED, seconds: fast ? 5 : 45, spot: spotAnswer(d, pid) });
    }
    return vsHold;
  }

  it("counts both columns on the same decided accounts, never more than the traced money for the team", async () => {
    expect(caseProof(await desk(), c().id)!.totals.decided).toBe(0);
    await worked();
    const p = caseProof(await desk(), c().id)!;
    expect(p.totals.decided).toBeGreaterThan(0);
    expect(p.totals.undecided).toBe(c().accounts.length - p.totals.decided);
    expect(p.totals.overTeam).toBe(0);
    expect(p.totals.overFast).toBeGreaterThan(p.totals.overTeam);
    expect(p.totals.fast).toBeGreaterThanOrEqual(p.totals.team);
    expect(p.rules.clocks.proposed).toBe(true);
    expect(p.rules.fast.assumed).toBe(true);
    expect(JSON.stringify(p)).not.toContain("expected");
  });

  it("Meera's wrong figure is her own slip; a right one on a rushed approval sends the line back; then she signs", async () => {
    await worked(true);
    let d = await desk();
    const p = caseProof(d, c().id)!;
    expect(p.picks.length).toBeGreaterThan(0);
    await expect(proofSign(meera, c().id)).rejects.toThrow(/Re-check/);
    const first = p.picks[0]!;
    const ans = pickAnswer(d, c().id, first.pid)!;
    expect(Math.abs(Math.round((first.amount * first.victimBefore) / first.balanceBefore) - ans)).toBeLessThanOrEqual(100_00);
    await expect(proofCheck(meera, c().id, first.pid, ans + 50_000_00)).rejects.toThrow(/doesn't match/);
    await expect(proofCheck(vikram, c().id, first.pid, ans)).rejects.toThrow(/compliance/);
    const r = await proofCheck(meera, c().id, first.pid, ans);
    expect(r.message).toMatch(/sent back/);
    d = await desk();
    expect(d.proofChecks.map((x) => x.ok)).toEqual([false, true]);
    expect(d.proofChecks.at(-1)!.sentTo).toEqual(["vikram"]);
    for (const x of p.picks.slice(1)) await proofCheck(meera, c().id, x.pid, pickAnswer(d, c().id, x.pid)!);
    await proofSign(meera, c().id);
    await expect(proofSign(meera, c().id)).rejects.toThrow(/already/);
    const s = (await desk()).proofSigned.get(c().id)!;
    expect(s.hash).toBe(caseProof(await desk(), c().id)!.hash);
    expect(s.issues).toBeGreaterThan(0);
  });
});

import { leaOfficer, leaCallback, leaNumber, leaDecide } from "@/lib/server/desk";
import { leaRequests, leaById, leaPreRead, LEA_EXPECTED } from "@/lib/server/lea";

describe("Police requests for call records: Imran vets, then releases, narrows or refuses", () => {
  beforeEach(() => useStore(new MemoryStore()));
  it("five requests, each with an expected answer, and the assistant can't spot a hacked mailbox", () => {
    expect(leaRequests().map((r) => r.id)).toEqual(Object.keys(LEA_EXPECTED));
    const fake = leaById("LEA-2")!, real = leaById("LEA-1")!;
    expect(fake.fromEmail).toBe(real.fromEmail);
    expect(fake.caseRef).toBe(real.caseRef);
    expect(leaPreRead(fake).join(" ")).toMatch(/hacked mailbox would match too/);
    // The one-digit slip is a real, unrelated customer.
    const slip = leaById("LEA-3")!.numbers.at(-1)!;
    expect(T.subscribers.find((s) => s.msisdn === slip)?.kycName).toBeTruthy();
    expect(T.attach.some((x) => x.msisdn === slip && W.rigs.some((r) => r.imei === x.imei))).toBe(false);
  });
  it("nothing leaves without the directory check, the call back, and every released number looked up", async () => {
    await expect(leaDecide(priya, "LEA-1", "RELEASE", [], "", "", "The request checks out", "")).rejects.toThrow(/Telco-A/);
    await expect(leaDecide(imran, "LEA-1", "RELEASE", [], "", "", "The request checks out", "")).rejects.toThrow(/directory/);
    await expect(leaCallback(imran, "LEA-1")).rejects.toThrow(/directory first/);
    expect((await leaOfficer(imran, "LEA-1", "ajay kumar")).message).toMatch(/Superintendent/);
    await expect(leaDecide(imran, "LEA-1", "RELEASE", [], "", "", "The request checks out", "")).rejects.toThrow(/Call the station back/);
    expect((await leaCallback(imran, "LEA-1")).message).toMatch(/confirms/);
    await expect(leaDecide(imran, "LEA-1", "RELEASE", [], "", "", "The request checks out", "")).rejects.toThrow(/Look up every number/);
    for (const n of leaById("LEA-1")!.numbers) await leaNumber(imran, "LEA-1", n);
    const r = await leaDecide(imran, "LEA-1", "RELEASE", [], "", "", "The request checks out", "");
    expect(r.message).toMatch(/Released 2 numbers/);
    const d = (await desk()).leaByReq.get("LEA-1")!;
    expect(d.flags).toEqual([]);
    expect(d.hash).toMatch(/^[0-9a-f]{16}$/);
    await expect(leaNumber(imran, "LEA-1", leaById("LEA-1")!.numbers[0]!)).rejects.toThrow(/already been answered/);
  });
  it("the hacked mailbox: only the call back shows it; releasing anyway is flagged for compliance", async () => {
    await leaOfficer(imran, "LEA-2", "Ajay Kumar Singh");
    expect((await leaCallback(imran, "LEA-2")).message).toMatch(/sent no such request/);
    await leaNumber(imran, "LEA-2", leaById("LEA-2")!.numbers[0]!);
    await leaDecide(imran, "LEA-2", "RELEASE", [], "", "", "The request checks out", "");
    expect((await desk()).leaByReq.get("LEA-2")!.flags.join(" ")).toMatch(/did not send/);
  });
  it("the typo: release less, never more; the Inspector's year-long ask is refused with a reply", async () => {
    const r = leaById("LEA-3")!;
    await leaOfficer(imran, "LEA-3", "Meenakshi Iyer");
    await leaCallback(imran, "LEA-3");
    for (const n of r.numbers) await leaNumber(imran, "LEA-3", n);
    const good = r.numbers.slice(0, -1);
    await expect(leaDecide(imran, "LEA-3", "NARROW", r.numbers, "", "", "Some numbers are not in the case", "Third number is not in the case")).rejects.toThrow(/everything they asked/);
    await expect(leaDecide(imran, "LEA-3", "NARROW", good, "", "", "Some numbers are not in the case", "")).rejects.toThrow(/reply/);
    await leaDecide(imran, "LEA-3", "NARROW", good, "", "", "Some numbers are not in the case", "The third number belongs to someone else; please check your file.");
    expect((await desk()).leaByReq.get("LEA-3")!.numbers).toEqual(good);
    await leaOfficer(imran, "LEA-4", "Rakesh Tiwari");
    await expect(leaDecide(imran, "LEA-4", "REFUSE", [], "", "", "Rank below Superintendent of Police", "no")).rejects.toThrow(/reply/);
    await leaDecide(imran, "LEA-4", "REFUSE", [], "", "", "Rank below Superintendent of Police", "Needs an SP's request and an FIR; a year of a hospital line is far wider than a nuisance complaint.");
    expect((await desk()).leaByReq.get("LEA-4")!.numbers).toEqual([]);
  });
  it("dates can be narrowed but never widened; over the 90-day line is flagged", async () => {
    const r = leaById("LEA-5")!;
    await leaOfficer(imran, "LEA-5", "Meenakshi Iyer");
    await leaCallback(imran, "LEA-5");
    await leaNumber(imran, "LEA-5", r.numbers[0]!);
    const day = (t: number) => new Date(t + 19_800_000).toISOString().slice(0, 10);
    await expect(leaDecide(imran, "LEA-5", "NARROW", r.numbers, day(r.from - 40 * 86_400_000), day(r.to), "Dates wider than the purpose needs", "Only since the account was opened.")).rejects.toThrow(/never more/);
    await leaDecide(imran, "LEA-5", "NARROW", r.numbers, day(r.to - 14 * 86_400_000), day(r.to), "Dates wider than the purpose needs", "Only the two weeks since the account was opened.");
    const d = (await desk()).leaByReq.get("LEA-5")!;
    expect(d.flags).toEqual([]);
    expect((d.to - d.from) / 86_400_000).toBeLessThan(16);
  });
});
