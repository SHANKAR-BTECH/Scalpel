import { Inbox } from "@/components/Inbox";
import { Provenance } from "@/components/Provenance";
import { PageHead } from "@/components/ui/Explain";

export default function InboxPage() {
  return (
    <>
      <PageHead title="Inbox"
        purpose={<>Police requests to hold scam money land here. Open one to see what happened, how much Scalpel suggests holding, and whether the hold passes the rules. Then act on it.</>}
        how={<>Start as <b>Officer</b> and propose the hold, then switch to <b>Supervisor</b> in the side panel to approve it. New to this? Open <b>How this desk works</b> at the bottom of the list.</>} />
      <Inbox />
      <Provenance />
    </>
  );
}
