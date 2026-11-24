export const BANNER_TEXT = "Simulation with fictional data. Not legal advice.";

export function Banner() {
  return (
    <div role="note" className="relative z-50 w-full text-center text-[12.5px] font-medium h-9 leading-9" style={{ background: "var(--rail)", color: "var(--rail-muted)" }}>
      {BANNER_TEXT}
    </div>
  );
}
