import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { W } from "@/lib/server/world";
import { alertById, traceView, ACTION_LABEL, TREASONS } from "@/lib/server/telco";
import { NumberTrace } from "@/components/NumberTrace";
import { userById } from "@/lib/users";

export default async function TelcoAlert({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("telco");
  const { id } = await params;
  const a = alertById(id);
  if (!a) notFound();
  const d = await desk();
  const t = d.telcoByAlert.get(a.id);
  const band = (msisdn: string) => d.fri.get(msisdn)?.band ?? W.phones.find((p) => p.msisdn === msisdn)?.fri ?? "LOW";
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
          a={a} view={traceView(a)} labels={ACTION_LABEL} reasons={TREASONS} now={d.now} packetAt={d.packets.get(a.id) ?? null}
          linked={a.linked.map((l) => ({ ...l, band: BAND[band(l.msisdn)] ?? band(l.msisdn) }))}
          done={t ? { action: ACTION_LABEL[t.action], agreed: t.agreed, reason: t.reason, note: t.note, by: userById(t.by)?.name ?? t.by, at: t.at, reported: t.reported } : null}
        />
      </div>
    </div>
  );
}
