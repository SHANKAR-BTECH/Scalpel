/** Display helpers, safe in the browser. Money is in paise. Times are shown in Indian time. */
export function inr(p: number, opts: { paise?: boolean } = {}): string {
  const abs = Math.abs(Math.round(p));
  const r = Math.floor(abs / 100), ps = abs % 100;
  const s = String(r), last3 = s.slice(-3), rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${p < 0 ? "-" : ""}₹${rest ? `${rest},${last3}` : last3}${opts.paise && ps ? "." + String(ps).padStart(2, "0") : ""}`;
}
/** Short form for big totals: ₹6.79 lakh, ₹1.2 crore. */
export function inrShort(p: number): string {
  const r = p / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} crore`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)} lakh`;
  return inr(p);
}
const IST = 5.5 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function when(t: number, withYear = false): string {
  const d = new Date(t + IST);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function day(t: number): string {
  const d = new Date(t + IST);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function ago(from: number, now: number): string {
  const mins = Math.round((now - from) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export function inDays(due: number, now: number): string {
  const d = Math.ceil((due - now) / 86_400_000);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} late`;
  if (d === 0) return "today";
  return `in ${d} day${d === 1 ? "" : "s"}`;
}
export const pct = (x: number) => `${Math.round(x * 100)}%`;
