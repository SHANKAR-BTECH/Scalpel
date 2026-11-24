/** Money in data is whole paise. Shown with Indian digit grouping: ₹3,28,679. Paise shown only when non-zero. */
export function formatRupees(paise: number): string {
  if (!Number.isFinite(paise)) throw new Error(`not a money amount: ${paise}`);
  const neg = paise < 0;
  const p = Math.round(Math.abs(paise));
  const rupees = Math.floor(p / 100);
  const rem = p % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "-" : ""}₹${grouped}${rem ? "." + String(rem).padStart(2, "0") : ""}`;
}

/** Short form for chart axes: ₹36.1 Cr, ₹3.3 L, ₹6,950. */
export function shortRupees(paise: number): string {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(1)} Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return formatRupees(Math.round(r) * 100);
}
