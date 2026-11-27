/** Priya's money trail pins (safe in the browser). A pin is a reference: a payment row's UTR or an account ID.
 *  The server looks every pin up again, so nothing typed in the browser counts as evidence on its own. */
export const TRAIL_KINDS = ["payment", "move", "gone", "kyc"] as const;
export type TrailKind = (typeof TRAIL_KINDS)[number];
export type TrailPin = { kind: TrailKind; ref: string; label: string };
export const TRAIL_TITLE: Record<TrailKind, string> = {
  payment: "Victims' payments", move: "Money moved on", gone: "Cash-outs (gone)", kyc: "Account checks",
};
/** Holds she proposes, account ID -> paise. */
export type TrailHolds = Record<string, number>;
