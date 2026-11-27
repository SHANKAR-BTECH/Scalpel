/** The demo team. Fictional people at a fictional bank and telecom company. Safe to import in the browser. */
export type Role = "officer" | "supervisor" | "auditor" | "telco" | "admin";

export interface User { id: string; name: string; role: Role; org: string; title: string; home: string; can: string[] }

export const USERS: User[] = [
  { id: "priya", name: "Priya Nair", role: "officer", org: "Bharat Demo Bank", title: "Fraud officer", home: "/inbox",
    can: ["Opens police hold requests grouped into cases", "Follows the money and the phones", "Proposes exact holds and asks Telco-A to block phones"] },
  { id: "vikram", name: "Vikram Rao", role: "supervisor", org: "Bharat Demo Bank", title: "Fraud supervisor", home: "/approvals",
    can: ["Approves or rejects what the officer proposes (never their own)", "Watches every hold's deadlines"] },
  { id: "meera", name: "Meera Iyer", role: "auditor", org: "Bharat Demo Bank", title: "Compliance and audit", home: "/assure",
    can: ["Checks that holds match the traced money", "Downloads the evidence file for any case", "Proves nothing was edited later"] },
  { id: "imran", name: "Imran Shaikh", role: "telco", org: "Telco-A", title: "Telecom fraud analyst", home: "/telco",
    can: ["Finds the phone behind many cases (SIM boxes, shared handsets)", "Blocks handsets, SIMs and routes", "Refuses to block spoofed or protected numbers"] },
  { id: "asha", name: "Asha Kulkarni", role: "admin", org: "Scalpel demo", title: "Demo admin", home: "/admin",
    can: ["Resets the demo", "Moves the clock forward to show deadlines", "Sees whether the shared database is connected"] },
];

export const userById = (id: string) => USERS.find((u) => u.id === id);
export const ROLE_LABEL: Record<Role, string> = { officer: "Fraud officer", supervisor: "Supervisor", auditor: "Compliance", telco: "Telco-A analyst", admin: "Admin" };
