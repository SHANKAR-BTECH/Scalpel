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
