import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { leaById, leaDay } from "@/lib/server/lea";
import { I, norm } from "@/lib/server/telcodata";
import { userById } from "@/lib/users";

export const dynamic = "force-dynamic";

const IST = 5.5 * 3_600_000;
const t = (ms: number) => new Date(ms + IST).toISOString().replace("T", " ").slice(0, 19);
const q = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const row = (xs: unknown[]) => xs.map(q).join(",");

/** The file for the requesting officer: only the numbers and days Imran released, with a fingerprint and a draft
 *  s.63 certificate. Nothing outside the release is in it. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || u.role !== "telco") return new NextResponse("Sign in as the Telco-A analyst.", { status: 403 });
  const { id } = await params;
  const r = leaById(id);
  if (!r) return new NextResponse("Unknown request.", { status: 404 });
  const d = await desk();
  const dec = d.leaByReq.get(r.id);
  if (!dec || !dec.numbers.length) return new NextResponse("Nothing was released on this request.", { status: 409 });
  const header = row(["Call ID", "Start (IST)", "Number", "Direction", "Other number", "Duration (s)", "Handset (IMEI)", "Tower"]);
  const rows: string[] = [];
  for (const n of dec.numbers) {
    for (const c of I().byNumber.get(norm(n)) ?? []) {
      if (c.at < dec.from || c.at > dec.to) continue;
      const out = norm(c.from) === norm(n);
      rows.push(row([c.id, t(c.at), n, out ? "out" : "in", out ? c.to : c.from, c.seconds, c.imei, c.cell]));
    }
  }
  const sha = createHash("sha256").update([header, ...rows].join("\r\n"), "utf8").digest("hex");
  const who = userById(u.id);
  const lines = [
    row(["Telco-A call records", `${r.id}: ${r.caseRef}`]),
    row(["For", `${r.officer}, ${r.station}, only. Not for banks or anyone else.`]),
    row(["Released", `${dec.numbers.length} of ${r.numbers.length} number(s) asked for, ${leaDay(dec.from)} to ${leaDay(dec.to)} (asked: ${leaDay(r.from)} to ${leaDay(r.to)})`]),
    row(["Checks before release", d.leaChecks.filter((x) => x.req === r.id).map((x) => `${x.kind}: ${x.text}`).join(" | ")]),
    row(["SHA-256 of the call table", sha]),
    "",
    header,
    ...rows,
    "",
    row(["CERTIFICATE FOR ELECTRONIC RECORDS", "Section 63(4), Bharatiya Sakshya Adhiniyam 2023. Draft for the analyst to sign; fictional demo data."]),
    row(["1. The record", `The call table above: ${rows.length} call records for the released numbers and dates.`]),
    row(["2. Produced by", "Telco-A's call-record (CDR) system, which keeps these records in the ordinary course of business."]),
    row(["3. Fingerprint", `SHA-256 ${sha}. Recompute it over the call table (header and rows, CRLF line ends) to check that no row was changed.`]),
    row(["4. Copied by", `${who?.name ?? u.id}, ${who?.title ?? "Telco-A analyst"}, Telco-A, at ${t(d.now)} IST.`]),
    row(["Signature", "______________________"]),
  ];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="telco-a-${r.id}.csv"`, "cache-control": "no-store" },
  });
}
