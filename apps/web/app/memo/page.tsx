import { demo } from "@/lib/data";
import { Provenance } from "@/components/Provenance";
import { Explain, PageHead } from "@/components/ui/Explain";
import { Memo } from "./Memo";

export const metadata = { title: "Hold memo · Scalpel" };

export default function MemoPage() {
  return (
    <>
      <div className="no-print">
        <PageHead eyebrow="The proof" title="One page per hold, ready for a court."
          lede="Laid out like a police-requested lien record: how much is held, under which rule, until when, and who approved it. Every amount, check and deadline comes straight from the engine." />
        <Explain
          takeaway={<>The bank holds only the traced scam money and passes all three checks. <b>On time?</b> shows amber because some deadline sources are still being checked against the original text, and we never count an unchecked source as a pass.</>}
          howToRead={<>Start with the big line at the top (amount held). Then the three coloured checks: green means passed with a checked source, amber means passed with a caution, red means fails. Switch to <b>Supervisor</b> to see the two-person rule for a whole freeze.</>}
        />
      </div>
      <Memo memo={demo.memo} />
      <Provenance />
    </>
  );
}
