import Link from "next/link";
import { Provenance } from "@/components/Provenance";
import { PageHead } from "@/components/ui/Explain";
import { QueueSettings } from "@/components/QueueSettings";

export const metadata = { title: "Work order · Scalpel" };

export default function OrderPage() {
  return (
    <>
      <PageHead eyebrow="Who gets handled first" title="Work order"
        purpose={<>Scam money keeps leaving every hour, so the order of the inbox matters. Choose how it is sorted. Hold amounts never change.</>}
        how={<>Recommended: <b>Biggest amount first</b>. It is simple, explainable and did as well as anything in our tests.</>} />
      <QueueSettings />
      <p className="mt-6 text-[14px] muted">Why this is the recommended order, and the test our model did not pass: <Link href="/results" className="link">see Results</Link>.</p>
      <Provenance />
    </>
  );
}
