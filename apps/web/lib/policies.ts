import type { DemoData } from "./demo-schema";

export const POLICY_LABEL: Record<keyof DemoData["headline"], string> = {
  none: "Do nothing",
  axe: "Whole freeze",
  ruler: "Exact hold (careful bank today)",
  scalpel: "Scalpel",
};

export const POLICY_NOTE: Record<keyof DemoData["headline"], string> = {
  none: "No holds at all. The sanity check: it must be worst on money missed.",
  axe: "Freeze every account the complaints point to, whole balance.",
  ruler: "Hold exactly the traced amount. Not our invention: careful banks do this.",
  scalpel: "Same hold sizes as the exact hold, plus who-first order, 3 reasons, rule checks and two-person approval.",
};

export function ratioText(r: number | null): string {
  return r === null ? "no trace" : `${r.toFixed(2)}×`;
}
