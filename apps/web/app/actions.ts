"use server";
/** Server actions: every button that changes something comes here. Each one checks who is signed in. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, signIn, signOut, signInHolder, holderRef } from "@/lib/server/auth";
import * as D from "@/lib/server/desk";
import { model } from "@/lib/server/world";
import { USERS } from "@/lib/users";
import { store } from "@/lib/server/store";
import * as L from "@/lib/server/lookup";
import { checkTrace, cleanPins } from "@/lib/server/tracecheck";
import * as B from "@/lib/server/bank";
import { checkTrail, cleanTrail } from "@/lib/server/trailcheck";

export interface Result { ok: boolean; message: string; at?: number }

async function run(fn: () => Promise<{ message: string }>): Promise<Result> {
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: r.message, at: Date.now() };
  } catch (e) {
    if (e instanceof D.DeskError) return { ok: false, message: e.message, at: Date.now() };
    throw e;
  }
}
async function me() {
  const u = await currentUser();
  if (!u) throw new D.DeskError("Please sign in again.");
  return u;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const rupeesToPaise = (s: string) => Math.round(Number(s.replace(/[₹,\s]/g, "")) * 100);

export async function loginAs(f: FormData) {
  const id = str(f, "user");
  const u = USERS.find((x) => x.id === id);
  if (!u) redirect("/login");
  await signIn(u.id);
  redirect(u.home);
}
export async function logout() { await signOut(); redirect("/"); }

export async function proposeHoldAction(_: Result | null, f: FormData) {
  return run(async () => D.proposeHold(await me(), str(f, "account"), f.get("amount") ? rupeesToPaise(str(f, "amount")) : Number(str(f, "paise")), str(f, "note")));
}
export async function decideAction(_: Result | null, f: FormData) {
  return run(async () => D.decide(await me(), str(f, "pid"), str(f, "approve") === "yes", str(f, "note")));
}
export async function proposeReleaseAction(_: Result | null, f: FormData) {
  return run(async () => D.proposeRelease(await me(), str(f, "hold"), str(f, "note")));
}
export async function grievanceAction(_: Result | null, f: FormData) {
  return run(async () => D.uploadGrievance(await me(), str(f, "hold")));
}
export async function askTelcoAction(_: Result | null, f: FormData) {
  return run(async () => D.askTelco(await me(), str(f, "case"), str(f, "kind") as "IMEI", str(f, "value"), str(f, "note")));
}
export async function telcoActAction(_: Result | null, f: FormData) {
  return run(async () => D.telcoAct(await me(), str(f, "kind") as "IMEI", str(f, "value")));
}
export async function telcoDecideAction(_: Result | null, f: FormData) {
  return run(async () => D.telcoDecide(await me(), str(f, "alert"), str(f, "action"), str(f, "reason"), str(f, "note"), str(f, "report") === "on", str(f, "ceir") === "on"));
}
export async function policePacketAction(_: Result | null, f: FormData) {
  return run(async () => D.policePacket(await me(), str(f, "alert")));
}
export async function simCheckAction(_: Result | null, f: FormData) {
  return run(async () => D.simCheck(await me(), str(f, "msisdn")));
}
export async function clockAction(_: Result | null, f: FormData) {
  return run(async () => D.moveClock(await me(), Number(str(f, "days"))));
}
export async function resetAction(_: Result | null, _f: FormData) {
  return run(async () => D.resetDemo(await me()));
}
export async function markReadAction() {
  const u = await currentUser();
  const ref = await holderRef();
  const s = await store();
  if (u) await s.markRead(u.id);
  if (ref) await s.markRead(`holder:${ref}`);
}

// ---- account holder ----
export async function holderLookup(_: Result | null, f: FormData): Promise<Result> {
  const ref = str(f, "ref").trim().toUpperCase();
  const last4 = str(f, "last4").trim();
  const d = await D.desk();
  const row = d.holds.find((h) => h.ref === ref);
  const phone = row ? model().accounts.get(row.hold.account)?.a.phone ?? "" : "";
  // The same answer for a wrong reference and a wrong phone, so nobody can probe which holds exist.
  if (!row || !/^\d{4}$/.test(last4) || !phone.replace(/\D/g, "").endsWith(last4)) return { ok: false, message: "We couldn't find a hold with those details.", at: Date.now() };
  await signInHolder(ref);
  redirect("/portal/status");
}
export async function holderReplyAction(_: Result | null, f: FormData) {
  const ref = await holderRef();
  if (!ref) return { ok: false, message: "Your session ended. Look up your hold again.", at: Date.now() };
  const file = f.get("file");
  const name = file && typeof file === "object" && "name" in file ? String((file as File).name) : "";
  return run(() => D.holderReply(ref, str(f, "text"), name));
}
export async function decideAccountAction(_: Result | null, f: FormData) {
  const amt = str(f, "amount").trim();
  return run(async () => D.decideAccount(await me(), str(f, "account"), str(f, "choice") as "HOLD", str(f, "reason"), str(f, "note"), amt ? rupeesToPaise(amt) : null));
}
export async function decideClearAction(_: Result | null, f: FormData) {
  return run(async () => D.decideClear(await me(), f.getAll("account").map(String)));
}
export async function signoffAction(_: Result | null, f: FormData) {
  return run(async () => D.signoff(await me(), str(f, "did"), str(f, "approve") === "yes", str(f, "note")));
}
export async function tamperAction(_: Result | null, _f: FormData) {
  return run(async () => D.tamperTest(await me()));
}

/* Telco-A lookup tools for the SIM trace workbench (read only: they never change the record). */
async function telcoOnly() {
  const u = await currentUser();
  if (!u || u.role !== "telco") throw new Error("Only Telco-A staff can use these tools.");
}
export async function lookupSubscriber(n: string) { await telcoOnly(); return L.subscriber(n); }
export async function lookupCalls(n: string, from: string | null, to: string | null) { await telcoOnly(); return L.callRecords(n, from, to); }
export async function lookupHandset(imei: string) { await telcoOnly(); return L.handset(imei); }
export async function lookupShop(pos: string) { await telcoOnly(); return L.shopLookup(pos); }
export async function lookupTower(id: string) { await telcoOnly(); return L.tower(id); }
export async function lookupSwitch(n: string) { await telcoOnly(); return L.switchLog(n); }
export async function lookupRoute(id: string) { await telcoOnly(); return L.route(id); }
export async function lookupDoc(doc: string) { await telcoOnly(); return L.kycDoc(doc); }
export async function checkTraceAction(alert: string, pins: unknown) { await telcoOnly(); return checkTrace(alert, cleanPins(pins)); }
export async function saveTraceAction(alert: string, pins: unknown, ticks: string[], note: string): Promise<Result> {
  return run(async () => D.saveTrace(await me(), alert, pins, Array.isArray(ticks) ? ticks.filter((t) => typeof t === "string") : [], String(note ?? "")));
}

/* Bank lookup tools for the money trail workbench (read only). */
async function bankOnly() {
  const u = await currentUser();
  if (!u || (u.role !== "officer" && u.role !== "supervisor")) throw new Error("Only bank fraud staff can use these tools.");
}
export async function lookupPayment(q: string) { await bankOnly(); return B.payment(String(q ?? "")); }
export async function lookupStatement(acct: string, from: string | null, to: string | null) {
  await bankOnly();
  const day = (x: string | null) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  return B.statement(String(acct ?? ""), day(from), day(to));
}
export async function lookupKyc(acct: string) { await bankOnly(); return B.kyc(String(acct ?? "")); }
export async function checkTrailAction(caseId: string, pins: unknown, holds: unknown) {
  await bankOnly();
  const t = cleanTrail(pins, holds);
  return checkTrail(String(caseId ?? ""), t.pins, t.holds);
}
export async function saveTrailAction(caseId: string, pins: unknown, holds: unknown, note: string): Promise<Result> {
  return run(async () => D.saveTrail(await me(), String(caseId ?? ""), pins, holds, String(note ?? "")));
}
