import { VerifyBox } from "@/components/VerifyBox";

export default function Verify() {
  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="mt-1">Verify an evidence file</h1>
      <p className="mt-2 muted">Open a Scalpel evidence file (.json). This page re-computes every fingerprint in your own browser, so nothing is sent anywhere. If any record was changed, added or removed, it says which.</p>
      <VerifyBox />
    </div>
  );
}
