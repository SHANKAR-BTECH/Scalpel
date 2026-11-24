import { demo } from "@/lib/data";
import { Provenance } from "@/components/Provenance";
import { PageHead } from "@/components/ui/Explain";
import { Memo } from "./Memo";

export const metadata = { title: "Hold memo · Scalpel" };

export default function MemoPage() {
  return (
    <>
      <PageHead eyebrow="The record of one hold" title="Hold memo"
        purpose={<>How much is held, under which rule, until when, and who approved it. Approve it, preview the notice to the holder, and print it on one A4 page.</>}
        how={<>Every rule check links to its source, so the police, a court or the holder can check it themselves.</>} />
      <Memo memo={demo.memo} />
      <Provenance />
    </>
  );
}
