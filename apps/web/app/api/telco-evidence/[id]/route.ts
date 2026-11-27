import { createHash } from "node:crypto";
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
  const header = row(["Call ID", "Start (IST)", "Duration (s)", "Real SIM", "Caller ID shown", "Shown number is", "Called number", "Called person", "Reported fraud", "Paid at (IST)", "Minutes from call to payment", "Amount paid (Rs)", "Bank case"]);
  const callRows = a.calls.map((c) => row([
    c.id, t(c.at), c.seconds, c.sim, c.shown, c.shownKind === "own" ? "the SIM's own number" : c.shownKind === "spoofed" ? "SPOOFED (someone else's)" : "SPOOFED (protected business number)",
    c.to, c.toName ?? "", c.scam ? "yes" : "no", c.paidAt ? t(c.paidAt) : "", c.paidAt ? Math.round((c.paidAt - c.at) / 60_000) : "", c.paid ? (c.paid / 100).toFixed(2) : "", c.caseId ?? "",
  ]));
  // The fingerprint covers the call table exactly as written below (header and rows, CRLF between lines).
  const sha = createHash("sha256").update([header, ...callRows].join("\r\n"), "utf8").digest("hex");
  const groups = d.groups.filter((g) => g.alert === a.id);
  const shops = d.shops.filter((x) => x.alert === a.id);
  const who = userById(u.id);
  const lines: string[] = [
    row(["Telco-A evidence file", `${a.id}: ${a.title}`]),
    row(["For", "Investigating police officer only. Not for banks (banks see only DoT's risk rating)."]),
    row(["Device", `${a.kind === "IMEI" ? "IMEI" : "Number"} ${a.value}`]),
    row(["Trace", `Version ${tr.version} (hash ${tr.hash}), ${tr.pins.length} clues, saved by ${userById(tr.by)?.name ?? tr.by} at ${t(tr.at)} IST`]),
    row(["Decision", dec ? `${ACTION_LABEL[dec.action as keyof typeof ACTION_LABEL] ?? dec.action} (${dec.reason})` : "Not decided yet"]),
    row(["Calls", `${a.calls.length} calls listed below; ${scam.length} reached people who later reported fraud`]),
    ...groups.map((g) => row(["Linked SIMs action", `${g.outcome === "DONE" ? "" : "REFUSED: "}${g.action} on ${g.sims.length} SIM(s) linked to ${g.anchor}${g.refused.length ? ` (${g.refused.join("; ")})` : ""}, ${t(g.at)} IST`])),
    ...shops.map((x) => row(["Shop action", `${x.outcome === "SUSPENDED" ? "Suspended and reported to DoT" : "Refused"}: ${x.pos}. ${x.why}`])),
    ...chk.signals.filter((x) => x.seen).map((x) => row(["Sign shown by the clues", `${x.label}: ${x.why}`])),
    ...chk.shows.map((x) => row(["AI summary of the clues", x])),
    row(["Note", "The AI summary only restates what the analyst pinned, looked up again in Telco-A's records. It does not decide."]),
    row(["Generated", `${t(d.now)} IST, Scalpel demo (fictional data)`]),
    row(["SHA-256 of the call table", sha]),
    "",
    header,
    ...callRows,
    "",
    row(["CERTIFICATE FOR ELECTRONIC RECORDS", "Section 63(4), Bharatiya Sakshya Adhiniyam 2023 (replaced s.65B of the Evidence Act). Draft for the analyst to sign; fictional demo data."]),
    row(["1. The record", `The call table above: ${a.calls.length} call records for ${a.kind === "IMEI" ? `IMEI ${a.value}` : `number ${a.value}`}, alert ${a.id}.`]),
    row(["2. Produced by", "Telco-A's call-record (CDR) and switch-log systems, which keep these records in the ordinary course of Telco-A's business."]),
    row(["3. Working order", "To the best of my knowledge the systems were operating properly when the records were made and copied; any fault did not affect them."]),
    row(["4. Fingerprint", `SHA-256 ${sha}. Recompute it over the call table (header and rows, CRLF line ends) to check that no row was changed.`]),
    row(["5. Copied by", `${who?.name ?? u.id}, ${who?.title ?? "Telco-A analyst"}, Telco-A, at ${t(d.now)} IST, from trace version ${tr.version}.`]),
    row(["Signature", "______________________ (signed on paper by the person named above)"]),
  ];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="telco-a-evidence-${a.id}.csv"`, "cache-control": "no-store" },
  });
}
