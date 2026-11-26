import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { W } from "@/lib/server/world";
import { alertById, traceView, ACTION_LABEL, TREASONS } from "@/lib/server/telco";
import { NumberTrace } from "@/components/NumberTrace";
import { userById } from "@/lib/users";
import { checkTrace } from "@/lib/server/tracecheck";
import { blast, sisters, shopDocCount } from "@/lib/server/telcogroup";
import { GROUP_LABEL } from "@/lib/server/desk";
import { T, norm } from "@/lib/server/telcodata";

export default async function TelcoAlert({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("telco");
  const { id } = await params;
  const a = alertById(id);
  if (!a) notFound();
  const d = await desk();
  const t = d.telcoByAlert.get(a.id);
  const band = (msisdn: string) => d.fri.get(msisdn)?.band ?? W.phones.find((p) => p.msisdn === msisdn)?.fri ?? "LOW";
  const tr = d.traces.get(a.id);
  const chk = tr ? checkTrace(a.id, tr.pins) : null;
  const trace = tr && chk ? { version: tr.version, by: userById(tr.by)?.name ?? tr.by, at: tr.at, pins: tr.pins.length, ...chk } : null;
  const blasts = Object.fromEntries(a.options.map((o) => [o, blast(a, o)]));
  const actedOn = new Map<string, string>();
  for (const g of d.groups) if (g.outcome === "DONE" && g.action !== "LEAVE") for (const n of g.sims) actedOn.set(norm(n), g.action === "BLOCK" ? "Blocked" : "Re-verify");
  const groups = (tr?.pins ?? []).filter((p) => p.kind === "group").map((p) => sisters(p.ref)).filter((r) => r.found).map((r) => ({
    anchor: r.anchor!, note: r.note, overLimit: r.overLimit, docCount: r.docCount,
    rows: r.rows.map((x) => ({ msisdn: x.msisdn, kycName: x.kycName, why: x.why, pos: x.pos, activatedAt: x.activatedAt, ownerYears: x.ownerYears, callsOut: x.callsOut, callsIn: x.callsIn, acted: actedOn.get(norm(x.msisdn)) ?? null })),
  }));
  const groupLog = d.groups.filter((g) => g.alert === a.id).map((g) => ({ action: GROUP_LABEL[g.action].split(":")[0]!, sims: g.sims.length, outcome: g.outcome, refused: g.refused, by: userById(g.by)?.name ?? g.by, at: g.at }));
  const docPins = (tr?.pins ?? []).filter((p) => p.kind === "doc").map((p) => p.ref);
  const shops = (tr?.pins ?? []).filter((p) => p.kind === "shop").map((p) => T.shops.find((x) => x.pos === p.ref)).filter((x) => x !== undefined).map((sh) => {
    const last = [...d.shops].reverse().find((x) => x.pos === sh.pos);
    return { pos: sh.pos, name: sh.name, verified: sh.verified, docs: docPins.map((doc) => ({ doc, sims: shopDocCount(sh.pos, doc) })).filter((x) => x.sims > 0), status: last ? { outcome: last.outcome, why: last.why, at: last.at } : null };
  });
  const BAND: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
  return (
    <div>
      <Link href="/telco" className="link inline-flex items-center gap-1 text-[13.5px]"><ChevronLeft size={15} aria-hidden />All alerts</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>{a.title}</h1>
          <p className="mt-1 mono text-[13px] muted">{a.sub}</p>
        </div>
        <span className="chip chip-phone" title="The rule that raised this alert">{a.rule}</span>
      </div>
      <div className="mt-5">
        <NumberTrace
          a={a} view={traceView(a)} labels={ACTION_LABEL} reasons={TREASONS} now={d.now} trace={trace} needs={checkTrace(a.id, []).actions} packetAt={d.packets.get(a.id) ?? null}
          blasts={blasts} groups={groups} groupLog={groupLog} shops={shops} groupLabels={GROUP_LABEL}
          linked={a.linked.map((l) => ({ ...l, band: BAND[band(l.msisdn)] ?? band(l.msisdn) }))}
          done={t ? { action: ACTION_LABEL[t.action], agreed: t.agreed, reason: t.reason, note: t.note, by: userById(t.by)?.name ?? t.by, at: t.at, reported: t.reported } : null}
        />
      </div>
    </div>
  );
}
