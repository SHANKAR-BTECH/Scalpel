/** Top of every desk: what this tab is for, in one plain sentence, and how to use it. */
export function PageHead({ title, purpose, how, right }: { title: string; purpose: React.ReactNode; how?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="no-print pt-7 sm:pt-9 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="title text-[30px] sm:text-[36px]">{title}</h1>
        <p className="mt-2 text-[16.5px] leading-relaxed">{purpose}</p>
        {how && <p className="mt-1 text-[14.5px] muted leading-relaxed">{how}</p>}
      </div>
      {right}
    </header>
  );
}

/** Dense tables stay one click away for the people who want them. */
export function FullData({ title, children, open = false, testid }: { title: string; children: React.ReactNode; open?: boolean; testid?: string }) {
  return (
    <details className="full card mt-6" open={open} data-testid={testid}>
      <summary className="flex items-center justify-between gap-3 px-5 py-4 rounded-[14px] transition-colors hover:bg-[var(--bg)]">
        <span className="font-semibold">{title}</span>
        <span className="chev muted text-lg" aria-hidden>›</span>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
