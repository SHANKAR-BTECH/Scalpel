import { demo } from "@/lib/data";

/** Ties every page to the exact code version and data file it was built from. */
export function Provenance() {
  const p = demo.provenance;
  return (
    <footer className="mt-10 border-t pt-3 text-xs muted" style={{ borderColor: "var(--line)" }}>
      <p>
        Built from commit <span className="font-mono">{p.commit}</span> · rules <span className="font-mono">{p.policyId}</span> · data fingerprint (sha256){" "}
        <span className="font-mono break-all" data-testid="sha">{p.demoSha256}</span> · generated {p.generatedAt}
      </p>
      <p className="mt-1">All numbers are <b>simulated</b>: they come from invented worlds whose rules are written down, not from any real bank.</p>
    </footer>
  );
}
