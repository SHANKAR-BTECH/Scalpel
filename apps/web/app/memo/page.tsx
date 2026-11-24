import { demo } from "@/lib/data";
import { Provenance } from "@/components/Provenance";
import { PageHead } from "@/components/ui/Explain";
import { Memo } from "./Memo";

export const metadata = { title: "Hold memo · Scalpel" };

export default function MemoPage() {
  return (
    <>
      <PageHead title="Hold memo"
        purpose={<>The official record of one hold: how much, under which rule, until when, and who approved it. Approve the hold here, preview the notice to the account holder, and print the page for the police or a court.</>}
        how={<>Green means the check passed with a source we have read in the original. Amber means it passed with a caution. Red means it fails. Every source is linked so anyone can check it.</>} />
      <Memo memo={demo.memo} />
      <Provenance />
    </>
  );
}
