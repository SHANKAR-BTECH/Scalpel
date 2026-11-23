/** Indian states/UTs (2-letter codes) and the High Court whose rulings bind there. */
export const STATES = ["AN","AP","AR","AS","BR","CH","CG","DN","DL","GA","GJ","HR","HP","JK","JH","KA","KL","LA","LD","MP","MH","MN","ML","MZ","NL","OD","PY","PB","RJ","SK","TN","TS","TR","UP","UK","WB"] as const;
export type StateCode = (typeof STATES)[number];

export const HIGH_COURT_OF: Record<StateCode, string> = {
  UP: "Allahabad", AP: "Andhra Pradesh", MH: "Bombay", GA: "Bombay", DN: "Bombay", WB: "Calcutta", AN: "Calcutta",
  CG: "Chhattisgarh", DL: "Delhi", AS: "Gauhati", AR: "Gauhati", MZ: "Gauhati", NL: "Gauhati", GJ: "Gujarat",
  HP: "Himachal Pradesh", JK: "Jammu & Kashmir and Ladakh", LA: "Jammu & Kashmir and Ladakh", JH: "Jharkhand",
  KA: "Karnataka", KL: "Kerala", LD: "Kerala", MP: "Madhya Pradesh", TN: "Madras", PY: "Madras", MN: "Manipur",
  ML: "Meghalaya", OD: "Orissa", BR: "Patna", PB: "Punjab & Haryana", HR: "Punjab & Haryana", CH: "Punjab & Haryana",
  RJ: "Rajasthan", SK: "Sikkim", TS: "Telangana", TR: "Tripura", UK: "Uttarakhand",
};

export const isState = (s: string): s is StateCode => (STATES as readonly string[]).includes(s);
