export const BANNER_TEXT = "Simulation with fictional data. Not legal advice.";

export function Banner() {
  return (
    <div role="note" className="w-full text-center text-sm py-1.5" style={{ background: "var(--warn)", color: "#fff" }}>
      {BANNER_TEXT}
    </div>
  );
}
