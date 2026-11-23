/**
 * All legal deadlines are IST calendar days ending 23:59:59.999 IST.
 * Day 0 = the day the event happened. "N days" = end of IST day (Day 0 + N).
 * IST is fixed UTC+05:30 (no daylight saving).
 */
export type Instant = number; // epoch ms
export type ISTDate = string; // YYYY-MM-DD

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istDate = (t: Instant): ISTDate => new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Start of an IST day as an instant. */
export function istStart(d: ISTDate): Instant {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new RangeError(`bad IST date ${d}`);
  return Date.parse(`${d}T00:00:00.000Z`) - IST_OFFSET_MS;
}
export const istEnd = (d: ISTDate): Instant => istStart(d) + DAY_MS - 1;

export const addDays = (d: ISTDate, n: number): ISTDate => istDate(istStart(d) + n * DAY_MS);

/** Parse "2026-12-20T14:05" (IST wall clock) or full ISO with offset. */
export function parseIST(s: string): Instant {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return Date.parse(s);
  const t = Date.parse(`${s.length === 10 ? s + "T00:00" : s}Z`);
  if (Number.isNaN(t)) throw new RangeError(`bad time ${s}`);
  return t - IST_OFFSET_MS;
}

export const formatIST = (t: Instant): string => new Date(t + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") + " IST";

export type DayUnit = "calendar" | "bank_working";

/** Indian bank holidays: Sundays, 2nd and 4th Saturdays, plus listed public holidays. */
export function isBankHoliday(d: ISTDate, holidays: ReadonlySet<ISTDate> = new Set()): boolean {
  if (holidays.has(d)) return true;
  const dt = new Date(`${d}T00:00:00Z`);
  const dow = dt.getUTCDay();
  if (dow === 0) return true;
  if (dow === 6) {
    const nth = Math.ceil(dt.getUTCDate() / 7);
    return nth === 2 || nth === 4;
  }
  return false;
}

/** Deadline instant: end of the IST day N units after the event's IST day. */
export function deadline(from: Instant, n: number, unit: DayUnit = "calendar", holidays?: ReadonlySet<ISTDate>): Instant {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`days must be a non-negative integer, got ${n}`);
  let d = istDate(from);
  if (unit === "calendar") return istEnd(addDays(d, n));
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isBankHoliday(d, holidays)) left--;
  }
  return istEnd(d);
}

/** Whole IST calendar days from a to b (b's day minus a's day). */
export const daysBetween = (a: Instant, b: Instant): number => Math.round((istStart(istDate(b)) - istStart(istDate(a))) / DAY_MS);
