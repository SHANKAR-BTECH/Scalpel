import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { alertById, ACTION_LABEL } from "@/lib/server/telco";
import { checkTrace } from "@/lib/server/tracecheck";
import { userById } from "@/lib/users";

export const dynamic = "force-dynamic";

const IST = 5.5 * 3_600_000;
const t = (ms: number) => new Date(ms + IST).toISOString().replace("T", " ").slice(0, 19);
const q = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const row = (xs: unknown[]) => xs.map(q).join(",");

/** Telco-A's evidence file for the police: a summary written from the analyst's saved trace (the AI check reads
 *  only his pins), then every call to a victim with its timings. Call records go to police only, never to banks. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || u.role !== "telco") return new NextResponse("Sign in as the Telco-A analyst.", { status: 403 });
  const { id } = await params;
  const a = alertById(id);
  if (!a) return new NextResponse("Unknown alert.", { status: 404 });
  const d = await desk();
  const tr = d.traces.get(a.id);
  if (!tr) return new NextResponse("Save a trace in the workbench first: the file is built from your saved trace.", { status: 409 });
  const chk = checkTrace(a.id, tr.pins);
  const dec = d.telcoByAlert.get(a.id);
  const scam = a.calls.filter((c) => c.scam);
  const lines: string[] = [
    row(["Telco-A evidence file", `${a.id}: ${a.title}`]),
    row(["For", "Investigating police officer only. Not for banks (banks see only DoT's risk rating)."]),
    row(["Device", `${a.kind === "IMEI" ? "IMEI" : "Number"} ${a.value}`]),
    row(["Trace", `Version ${tr.version} (hash ${tr.hash}), ${tr.pins.length} clues, saved by ${userById(tr.by)?.name ?? tr.by} at ${t(tr.at)} IST`]),
    row(["Decision", dec ? `${ACTION_LABEL[dec.action as keyof typeof ACTION_LABEL] ?? dec.action} (${dec.reason})` : "Not decided yet"]),
    row(["Calls", `${a.calls.length} calls listed below; ${scam.length} reached people who later reported fraud`]),
    ...chk.signals.filter((x) => x.seen).map((x) => row(["Sign shown by the clues", `${x.label}: ${x.why}`])),
    ...chk.shows.map((x) => row(["AI summary of the clues", x])),
    row(["Note", "The AI summary only restates what the analyst pinned, looked up again in Telco-A's records. It does not decide."]),
    row(["Generated", `${t(d.now)} IST, Scalpel demo (fictional data)`]),
    "",
    row(["Call ID", "Start (IST)", "Duration (s)", "Real SIM", "Caller ID shown", "Shown number is", "Called number", "Called person", "Reported fraud", "Paid at (IST)", "Minutes from call to payment", "Amount paid (Rs)", "Bank case"]),
    ...a.calls.map((c) => row([
      c.id, t(c.at), c.seconds, c.sim, c.shown, c.shownKind === "own" ? "the SIM's own number" : c.shownKind === "spoofed" ? "SPOOFED (someone else's)" : "SPOOFED (protected business number)",
      c.to, c.toName ?? "", c.scam ? "yes" : "no", c.paidAt ? t(c.paidAt) : "", c.paidAt ? Math.round((c.paidAt - c.at) / 60_000) : "", c.paid ? (c.paid / 100).toFixed(2) : "", c.caseId ?? "",
    ])),
  ];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="telco-a-evidence-${a.id}.csv"`, "cache-control": "no-store" },
  });
}
