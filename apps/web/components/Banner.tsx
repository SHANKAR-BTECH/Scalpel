export const BANNER_TEXT = "Simulation with fictional data. Not legal advice.";

export function Banner() {
  return (
    <div role="note" className="relative z-50 w-full text-center text-[12px] font-medium h-8 leading-8 border-b"
      style={{ background: "var(--bg-2)", color: "var(--muted)", borderColor: "var(--line)" }}>
      {BANNER_TEXT}
    </div>
  );
}
