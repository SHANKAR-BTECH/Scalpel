/** Polled every few seconds by signed-in browsers: a version number (to know when to refresh) and the bell's messages. */
import { NextResponse } from "next/server";
import { currentUser, holderRef } from "@/lib/server/auth";
import { store } from "@/lib/server/store";
import { demoNow } from "@/lib/server/desk";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  const ref = await holderRef();
  const s = await store();
  const to = u?.id ?? (ref ? `holder:${ref}` : null);
  const notes = to ? await s.notes(to, 20) : [];
  return NextResponse.json({ version: await s.version(), now: await demoNow(s), unread: notes.filter((n) => !n.read).length, notes }, { headers: { "cache-control": "no-store" } });
}
