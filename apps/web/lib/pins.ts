/** Pins on an engineer's trace: shared by the workbench (browser) and the server check. */
export const PIN_KINDS = ["number", "handset", "sims", "sim", "tower", "stats", "shop", "doc", "spoof", "route", "police", "dlt", "chakshu", "swap", "forwarding", "call", "group", "bulk"] as const;
export type PinKind = (typeof PIN_KINDS)[number];
export type PinRef = { kind: PinKind; ref: string; label: string };

export const PIN_TITLE: Record<PinKind, string> = {
  number: "Number", handset: "Handset", sims: "SIMs in the handset", sim: "SIM", tower: "Tower", stats: "Call statistics", shop: "Shop (point of sale)",
  doc: "KYC document", spoof: "Switch log: caller ID", route: "Route", police: "Police letter", dlt: "Business sender registration", chakshu: "Citizen reports",
  swap: "SIM swap history", forwarding: "Call forwarding", call: "Call record", group: "Linked SIMs (same ID or batch)", bulk: "Company papers (bulk connection)",
};
