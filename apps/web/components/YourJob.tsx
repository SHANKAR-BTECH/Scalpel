/** One plain line at the top of each person's screen: who you are here and what you do. */
export function YourJob({ who, children }: { who: string; children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[13.5px]" data-testid="your-job">
      <span className="chip chip-blue mr-2">Your job · {who}</span>
      <span className="muted">{children}</span>
    </p>
  );
}
