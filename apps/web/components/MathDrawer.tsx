/** "How is this worked out?": the formula and its inputs, so every number can be checked by hand. */
export function MathDrawer({ formula, inputs }: { formula: string; inputs: [string, string][] }) {
  return (
    <details className="full mt-3 text-sm">
      <summary className="cursor-pointer select-none font-medium flex items-center gap-1.5" style={{ color: "var(--accent-ink)" }}>
        <span className="chev" aria-hidden>›</span>How is this worked out?
      </summary>
      <div className="mt-2 rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
        <p className="text-xs leading-relaxed break-words">{formula}</p>
        <ul className="mt-2 text-xs space-y-0.5">
          {inputs.map(([k, v]) => (
            <li key={k}><span className="muted">{k}:</span> <span className="num font-medium">{v}</span></li>
          ))}
        </ul>
      </div>
    </details>
  );
}
