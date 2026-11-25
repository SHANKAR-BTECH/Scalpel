/** The clues that moved the mule score most: red pushes towards "mule", green pushes away. */
export function WhyBars({ why }: { why: { clue: string; push: number }[] }) {
  if (!why.length) return <p className="text-[12.5px] muted">This account has no mule score: the model only scores accounts on a money trail.</p>;
  const max = Math.max(...why.map((w) => Math.abs(w.push)), 0.001);
  return (
    <ul className="space-y-1.5" data-testid="why">
      {why.map((w, i) => (
        <li key={i} className="grid grid-cols-[1fr_120px] items-center gap-3 text-[13px]">
          <span>{w.clue}</span>
          <span className="relative h-2 rounded-full bg-[var(--line)]">
            <span className="bar-grow absolute top-0 h-full rounded-full" style={{
              width: `${(Math.abs(w.push) / max) * 50}%`, left: w.push >= 0 ? "50%" : `${50 - (Math.abs(w.push) / max) * 50}%`,
              background: w.push >= 0 ? "var(--bad)" : "var(--good)", transformOrigin: w.push >= 0 ? "left" : "right", animationDelay: `${i * 80}ms`,
            }} />
            <span className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-[var(--line-strong)]" />
          </span>
        </li>
      ))}
      <li className="text-[11.5px] muted">Bars to the right push towards &ldquo;mule&rdquo;, to the left away from it. From the mule-score model (logistic regression on 17 clues, scored ahead of time).</li>
    </ul>
  );
}
