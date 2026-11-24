/** Top of every desk: what this tab is for, in one plain sentence, and how to use it. */
export function PageHead({ eyebrow, title, purpose, how, right }: { eyebrow?: string; title: React.ReactNode; purpose: React.ReactNode; how?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="no-print pt-9 sm:pt-11 pb-2 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="title text-[32px] sm:text-[36px]">{title}</h1>
        <p className="mt-4 text-[16px] leading-[1.7] muted max-w-2xl">{purpose}</p>
      </div>
      {(how || right) && (
        <aside className="max-w-[260px] text-[13px] muted pb-1">
          {how && <><span className="note-rule mb-3" />{how}</>}
          {right}
        </aside>
      )}
    </header>
  );
}

/** Dense tables stay one click away for the people who want them. */
export function FullData({ title, children, open = false, testid }: { title: React.ReactNode; children: React.ReactNode; open?: boolean; testid?: string }) {
  return (
    <details className="full card mt-6" open={open} data-testid={testid}>
      <summary className="flex items-center justify-between gap-3 px-5 py-4 rounded-[10px] transition-colors hover:bg-[var(--accent-tint)]">
        <span className="font-semibold">{title}</span>
        <span className="chev muted text-lg" aria-hidden>›</span>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
