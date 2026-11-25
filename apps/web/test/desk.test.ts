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

describe("person and AI decide together", () => {
  beforeEach(() => useStore(new MemoryStore()));
  const meera = userById("meera")!;
  const all = () => [...model().accounts.values()];
  it("an agreed hold becomes a proposal for the supervisor", async () => {
    const v = all().find((x) => aiView(x, START).suggest === "HOLD" && x.traced > 1000_00)!;
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    const d = await desk();
    expect(d.decisionByAccount.get(v.a.id)!.agreed).toBe(true);
    expect(d.pendingByAccount.get(v.a.id)!.amount).toBe(aiView(v, START).amount);
    await expect(decideAccount(priya, v.a.id, "NO_HOLD", "Other", "twice over")).rejects.toThrow(/already/);
  });
  it("overruling a confident AI needs sign-off, and a send-back reopens the account", async () => {
    const v = all().find((x) => { const ai = aiView(x, START); return ai.suggest === "HOLD" && ai.confidence >= 0.8; })!;
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
    await expect(decideAccount(priya, v.a.id, "HOLD", "Other", "hold anyway")).rejects.toThrow(/can't be used/);
    await decideAccount(priya, v.a.id, "SEND_BACK", "Police request can't be used as it is", "");
  });
  it("the tamper test catches a changed entry and leaves the record alone", async () => {
    const v = all().find((x) => aiView(x, START).suggest === "HOLD" && x.traced > 1000_00)!;
    await decideAccount(priya, v.a.id, "HOLD", "Evidence matches the suggestion", "");
    const before = (await desk()).chain.map((e) => e.hash).join();
    const r = await tamperTest(meera);
    expect(r.row).toBeTypeOf("number");
    expect((await desk()).chain.map((e) => e.hash).join()).toBe(before);
    expect((await verifyChain((await desk()).chain)).ok).toBe(true);
  });
});
