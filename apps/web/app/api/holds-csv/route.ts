import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model } from "@/lib/server/world";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u || !["auditor", "supervisor"].includes(u.role)) return new NextResponse("Sign in as compliance.", { status: 403 });
  const d = await desk();
  const m = model();
  const head = "hold_ref,case,account,amount_inr,traced_inr,placed_at_ist,state,deadline_missed";
  const lines = d.holds.map((h) => [h.ref, h.caseId, h.hold.account, (h.hold.amount / 100).toFixed(2), ((m.accounts.get(h.hold.account)?.traced ?? 0) / 100).toFixed(2),
    new Date(h.hold.events[0]!.at + 19_800_000).toISOString().slice(0, 16).replace("T", " "), h.hold.state, h.clocks.some((c) => c.state === "EXPIRED" || c.state === "SATISFIED_LATE") ? "yes" : "no"].join(","));
  return new NextResponse([head, ...lines].join("\n") + "\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="scalpel-holds.csv"' } });
}
