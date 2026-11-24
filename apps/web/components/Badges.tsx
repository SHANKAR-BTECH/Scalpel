import type { Source } from "@/lib/demo-schema";
import { citeable, sourceLabel, type Badge } from "@/lib/rules";

export function Badges({ badges, sources }: { badges: Badge[]; sources: Source[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {badges.map((b) => {
        const { cited, uncited } = citeable(b.items.flatMap((i) => i.sources), sources);
        return (
          <section key={b.key} className="card p-3" data-testid={`badge-${b.key}`}>
            <h3 className="font-semibold flex items-center gap-2">
              <span aria-hidden className="inline-block w-5 h-5 rounded-full text-center text-white text-xs leading-5"
                style={{ background: b.pass ? "var(--good)" : "var(--bad)" }}>{b.pass ? "✓" : "✕"}</span>
              {b.title} <span className="text-sm font-normal">{b.pass ? "Yes" : "No"}</span>
            </h3>
            <ul className="mt-2 text-sm space-y-1">
              {b.items.map((i) => (
                <li key={i.id}><span className="font-mono text-xs muted">{i.id}</span> {i.ok ? "✓" : "✕"} {i.plain}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs" data-testid="cited">
              <span className="muted">Sources (checked against the original):</span>
              {cited.length ? (
                <ul className="list-disc ml-4">
                  {cited.map((s) => <li key={s.id}>{s.url ? <a href={s.url} className="underline">{sourceLabel(s)}</a> : sourceLabel(s)}</li>)}
                </ul>
              ) : <p>none yet</p>}
              {uncited.length > 0 && <p className="mt-1"><span className="tag">source being checked</span> {uncited.length} more, listed below</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
