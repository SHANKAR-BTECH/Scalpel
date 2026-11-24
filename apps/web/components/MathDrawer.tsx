/** "How is this worked out?": the formula and its inputs, so every number can be checked by hand. */
export function MathDrawer({ formula, inputs }: { formula: string; inputs: [string, string][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer muted select-none">How is this worked out?</summary>
      <div className="mt-2 rounded-md p-2" style={{ background: "var(--bg)" }}>
        <p className="font-mono text-xs break-words">{formula}</p>
        <ul className="mt-1 text-xs">
          {inputs.map(([k, v]) => (
            <li key={k}><span className="muted">{k}:</span> {v}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
