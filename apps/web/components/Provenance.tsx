import { readFileSync } from "node:fs";
import { join } from "node:path";
import { demo } from "@/lib/data";

/** The fingerprint file sits next to demo.json: `sha256sum data/demo.json` (or `certutil -hashfile data\demo.json SHA256`) must print the same. */
function fingerprint(): string {
  try { return readFileSync(join(process.cwd(), "data", "demo.sha256"), "utf8").split(/\s+/)[0] ?? ""; } catch { return "missing"; }
}

/** Ties every page to the exact code version and data file it was built from. */
export function Provenance() {
  const p = demo.provenance;
  return (
    <footer className="mt-10 border-t pt-3 text-xs muted" style={{ borderColor: "var(--line)" }}>
      <p>
        Data built from code at commit <span className="font-mono">{p.commit}</span> · rules <span className="font-mono">{p.policyId}</span> · sha256 of data/demo.json{" "}
        <span className="font-mono break-all" data-testid="sha">{fingerprint()}</span> · generated {p.generatedAt}
      </p>
      <p className="mt-1">All numbers are <b>simulated</b>: they come from invented worlds whose rules are written down, not from any real bank.</p>
    </footer>
  );
}
