import type { Source } from "@/lib/demo-schema";
import { citeable, sourceLabel, STATE_MARK, STATE_WORD, type Badge } from "@/lib/rules";

const COLOR = { pass: "var(--good)", caution: "var(--warn)", fail: "var(--bad)" } as const;

export function Badges({ badges, sources }: { badges: Badge[]; sources: Source[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {badges.map((b) => {
        const { cited, uncited } = citeable(b.items.flatMap((i) => i.sources), sources);
        return (
          <section key={b.key} className="card p-3" data-testid={`badge-${b.key}`} data-state={b.state}>
            <h3 className="font-semibold flex items-center gap-2">
              <span aria-hidden className="inline-block w-5 h-5 rounded-full text-center text-white text-xs leading-5"
                style={{ background: COLOR[b.state] }}>{STATE_MARK[b.state]}</span>
              {b.title} <span className="text-sm font-normal">{STATE_WORD[b.state]}</span>
            </h3>
            {b.reasons.length > 0 && <ul className="mt-1 text-xs" data-testid="badge-reasons">{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
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
