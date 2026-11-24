import { demo } from "@/lib/data";
import { Provenance } from "@/components/Provenance";
import { Memo } from "./Memo";

export const metadata = { title: "Hold memo · Scalpel" };

export default function MemoPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold no-print">Hold memo</h1>
      <p className="mt-1 muted max-w-3xl no-print">
        One page per hold, laid out like a police-requested lien record: how much, under which rule, until when, and who approved it.
        Every amount, check and deadline comes straight from the engine.
      </p>
      <Memo memo={demo.memo} />
      <Provenance />
    </>
  );
}
