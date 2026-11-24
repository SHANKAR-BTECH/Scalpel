export const BANNER_TEXT = "Simulation with fictional data. Not legal advice.";

export function Banner() {
  return (
    <div role="note" className="w-full text-center text-[12.5px] font-medium py-1.5 tracking-wide" style={{ background: "var(--warn-tint)", color: "var(--warn)", borderBottom: "1px solid var(--line)" }}>
      {BANNER_TEXT}
    </div>
  );
}
