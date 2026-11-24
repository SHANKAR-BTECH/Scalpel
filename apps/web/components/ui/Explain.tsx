/** The plain-words box at the top of every page: the takeaway first, then how to read the page. */
export function Explain({ takeaway, howToRead, testid }: { takeaway: React.ReactNode; howToRead: React.ReactNode; testid?: string }) {
  return (
    <aside className="explain no-print mt-6 p-5 sm:p-6 grid gap-4 sm:grid-cols-[1fr_1fr]" data-testid={testid}>
      <div>
        <p className="eyebrow" style={{ color: "var(--accent-ink)" }}>What this shows</p>
        <p className="mt-1.5 text-[15.5px] leading-relaxed">{takeaway}</p>
      </div>
      <div>
        <p className="eyebrow">How to read it</p>
        <p className="mt-1.5 text-[15px] leading-relaxed muted">{howToRead}</p>
      </div>
    </aside>
  );
}

export function PageHead({ eyebrow, title, lede }: { eyebrow: string; title: React.ReactNode; lede?: React.ReactNode }) {
  return (
    <header className="pt-6 sm:pt-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display text-[34px] sm:text-[46px] mt-3 max-w-3xl">{title}</h1>
      {lede && <p className="mt-3 max-w-2xl text-[17px] muted leading-relaxed">{lede}</p>}
    </header>
  );
}

/** Dense tables stay one click away for the people who want them. */
export function FullData({ title, children, open = false, testid }: { title: string; children: React.ReactNode; open?: boolean; testid?: string }) {
  return (
    <details className="full card mt-6" open={open} data-testid={testid}>
      <summary className="flex items-center justify-between gap-3 px-5 py-4">
        <span><span className="eyebrow">Full data</span><span className="block font-semibold mt-0.5">{title}</span></span>
        <span className="chev muted text-lg" aria-hidden>›</span>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
