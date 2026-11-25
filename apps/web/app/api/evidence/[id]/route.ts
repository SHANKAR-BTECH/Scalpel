import { NextResponse } from "next/server";
import { buildEvidencePack } from "@scalpel/engine";
import { currentUser } from "@/lib/server/auth";
import { desk, exportEvidence } from "@/lib/server/desk";
import { W } from "@/lib/server/world";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !["auditor", "supervisor"].includes(u.role)) return new NextResponse("Sign in as compliance.", { status: 403 });
  const { id } = await params;
  const d = await desk();
  const pack = await buildEvidencePack(id, d.chain, d.now, { name: W.bank.name, system: "Scalpel demo (simulation)" });
  await exportEvidence(u, id);
  return new NextResponse(JSON.stringify(pack, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="scalpel-evidence-${id}.json"`, "cache-control": "no-store" },
  });
}
