import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { caseById, model, holderName, W } from "@/lib/server/world";
import { userById } from "@/lib/users";
import { TrailWorkbench, type ComplaintItem } from "@/components/TrailWorkbench";

/** Priya's money trail workbench: she follows the money herself from the statements; the AI only checks her pins. */
export default async function TrailWork({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("officer", "supervisor");
  const { id } = await params;
  const c = caseById(id);
  if (!c) notFound();
  const d = await desk();
  const tx = new Map(W.txns.map((t) => [t.id, t]));
  const complaints: ComplaintItem[] = c.complaints.map((x, i) => ({ id: x.id, ack: x.ack, utr: x.txnId, victim: c.victims[i]!.name, amount: tx.get(x.txnId)!.amount, reportedAt: x.reportedAt }));
  const t = d.trails.get(c.id);
  const m = model();
  const saved = t ? {
    version: t.version, pins: t.pins, holds: t.holds, by: userById(t.by)?.name ?? t.by, at: t.at,
    accounts: t.reached.map((a) => ({ id: a, name: holderName(m.accounts.get(a)!.a) })),
  } : null;
  return (
    <div>
      <Link href={`/case/${c.id}`} className="link inline-flex items-center gap-1 text-[13.5px]"><ChevronLeft size={15} aria-hidden />Back to {c.id}</Link>
      <h1 className="mt-2">Money trail workbench: {c.id}</h1>
      <p className="mt-1 max-w-[800px] muted">Start from a victim&apos;s payment, open the account that received it, and read its statement. Pin the payments that carry the victims&apos; money on, and the cash-outs where it left. Write the amount you would hold on each account. When you are ready, check your trail: it tells you how much money your trail still misses and from where.</p>
      <TrailWorkbench caseId={c.id} complaints={complaints} firstDay={c.firstAt} lastDay={d.now} saved={saved} canSave={u.role === "officer"} />
    </div>
  );
}
