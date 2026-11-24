import { Inbox } from "@/components/Inbox";
import { Provenance } from "@/components/Provenance";
import { PageHead } from "@/components/ui/Explain";

export default function InboxPage() {
  return (
    <>
      <PageHead eyebrow="Police hold requests · BNSS s.106" title={<>Hold the scam money,<br />not <em className="not-italic" style={{ color: "var(--accent)" }}>the whole account.</em></>}
        purpose={<>Open a request, check the suggested hold, and act on it. Officers propose, supervisors approve.</>}
        how={<>Switch between <b>Officer</b> and <b>Supervisor</b> at the top right. New here? Open <b>How this desk works</b> in the list.</>} />
      <Inbox />
      <Provenance />
    </>
  );
}
