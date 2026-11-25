import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { W } from "@/lib/server/world";
import { alerts } from "@/lib/server/telco";
import { SimWorkbench } from "@/components/SimWorkbench";

/** Imran's SIM trace workbench: he looks things up and builds the trace himself; the AI only checks his pins. */
export default async function Workbench({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  await requireUser("telco");
  const { n } = await searchParams;
  const d = await desk();
  const leads = [
    ...alerts().map((a) => ({ label: `${a.id}: ${a.kind === "IMEI" ? "handset" : "number"} ${a.value}`, value: a.value, tool: (a.kind === "IMEI" ? "imei" : "sub") as "imei" | "sub" })),
    ...d.asks.filter((a) => !a.done && a.kind === "MSISDN").map((a) => ({ label: `Bank asks about ${a.value}`, value: a.value, tool: "sub" as const })),
  ];
  const ts = W.calls.map((c) => c.at);
  return (
    <div>
      <Link href="/telco" className="link inline-flex items-center gap-1 text-[13.5px]"><ChevronLeft size={15} aria-hidden />All alerts</Link>
      <h1 className="mt-2">SIM trace workbench</h1>
      <p className="mt-1 max-w-[780px] muted">Look up a number, read its call records, look up the handset it was used in, and pin what matters. Your trace is built only from your pins. When you are ready, ask the AI to check it: it tells you what your evidence supports and what is still missing.</p>
      <SimWorkbench leads={leads} start={n ?? null} firstDay={Math.min(...ts)} lastDay={Math.max(...ts)} />
    </div>
  );
}
