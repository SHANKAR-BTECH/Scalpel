/** Money is always integer paise. Never floats. */
export type Paise = number;

export function assertPaise(p: number, label = "amount"): asserts p is Paise {
  if (!Number.isSafeInteger(p) || p < 0) throw new RangeError(`${label} must be a non-negative integer paise, got ${p}`);
}

export const rupees = (r: number): Paise => {
  const p = Math.round(r * 100);
  assertPaise(p);
  return p;
};

/** ₹1,23,456.78 style (Indian digit grouping). Paise shown only when non-zero. */
export function formatINR(p: Paise): string {
  const neg = p < 0;
  const abs = Math.abs(p);
  const r = Math.floor(abs / 100);
  const ps = abs % 100;
  const s = String(r);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const body = rest ? `${rest},${last3}` : last3;
  return `${neg ? "-" : ""}₹${body}${ps ? "." + String(ps).padStart(2, "0") : ""}`;
}

/**
 * Split `total` paise across keys in proportion weight/base, rounding so the parts
 * add up exactly to floor-or-round of the ideal sum (largest-remainder method).
 * Requires sum(weights) <= base. Deterministic tie-break by key.
 */
export function splitProportional<K extends string>(total: Paise, weights: Record<K, Paise>, base: Paise): Record<K, Paise> {
  assertPaise(total, "total");
  assertPaise(base, "base");
  const keys = (Object.keys(weights) as K[]).filter((k) => weights[k] > 0).sort();
  const out = {} as Record<K, Paise>;
  if (base === 0 || keys.length === 0) return out;
  const T = BigInt(total), B = BigInt(base);
  let wsum = 0n;
  const rems: { k: K; rem: bigint }[] = [];
  let floorSum = 0n;
  for (const k of keys) {
    const w = BigInt(weights[k]);
    wsum += w;
    const num = T * w;
    const q = num / B;
    out[k] = Number(q);
    floorSum += q;
    rems.push({ k, rem: num % B });
  }
  if (wsum > B) throw new RangeError("weights exceed base");
  // ideal total share = T*wsum/B, rounded half-up
  const idealNum = T * wsum;
  const ideal = idealNum / B + ((idealNum % B) * 2n >= B ? 1n : 0n);
  let left = Number(ideal - floorSum);
  rems.sort((a, b) => (a.rem === b.rem ? (a.k < b.k ? -1 : 1) : a.rem > b.rem ? -1 : 1));
  for (const { k } of rems) {
    if (left <= 0) break;
    // never exceed the weight itself (a share can't be bigger than what was there)
    if (out[k] < weights[k]) { out[k] += 1; left--; }
  }
  return out;
}

export const sum = (xs: Iterable<Paise>): Paise => { let s = 0; for (const x of xs) s += x; return s; };
