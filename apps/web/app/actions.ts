"use server";
/** Server actions: every button that changes something comes here. Each one checks who is signed in. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, signIn, signOut, signInHolder, holderRef } from "@/lib/server/auth";
import * as D from "@/lib/server/desk";
import { model } from "@/lib/server/world";
import { USERS } from "@/lib/users";
import { store } from "@/lib/server/store";

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
