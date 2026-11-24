/** Who does what. Two people can run Scalpel: one officer and one supervisor. Demo roles only, there is no real login. */
export const ROLES = {
  officer: {
    title: "Officer",
    who: "The bank's fraud desk officer who handles the complaint.",
    can: ["See the complaint, the money trail and the traced amount", "Propose an exact hold for the traced amount", "Propose a whole-account freeze, only when the rules allow it", "Print the hold memo"],
    cannot: ["Approve their own whole-freeze proposal", "Hold more than the traced amount"],
  },
  supervisor: {
    title: "Supervisor",
    who: "A senior officer who checks the officer's work.",
    can: ["See everything the officer sees", "Approve or refuse a whole-freeze proposal", "Sign off the exact hold"],
    cannot: ["Start a whole-freeze proposal themselves", "Change the traced amount"],
  },
} as const;

export type RoleKey = keyof typeof ROLES;

export function RoleCard({ role, active }: { role: RoleKey; active?: boolean }) {
  const r = ROLES[role];
  return (
    <div className="card p-6 h-full" style={active ? { borderColor: "var(--accent-line)", boxShadow: "0 0 0 3px var(--accent-tint), var(--shadow)" } : undefined} data-testid={`role-card-${role}`}>
      <p className="font-semibold text-[18px]">{r.title}</p>
      <p className="text-[14.5px] muted mt-1">{r.who}</p>
      <p className="label mt-4" style={{ color: "var(--good)" }}>Can</p>
      <ul className="mt-1.5 space-y-1.5 text-[15px]">{r.can.map((x) => <li key={x} className="flex gap-2"><Mark ok />{x}</li>)}</ul>
      <p className="label mt-4" style={{ color: "var(--bad)" }}>Cannot</p>
      <ul className="mt-1.5 space-y-1.5 text-[15px]">{r.cannot.map((x) => <li key={x} className="flex gap-2"><Mark />{x}</li>)}</ul>
    </div>
  );
}

function Mark({ ok }: { ok?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="mt-1 shrink-0">
      <circle cx="8" cy="8" r="7.5" fill={ok ? "var(--good-tint)" : "var(--freeze-tint)"} />
      {ok ? <path d="M4.8 8.2l2.1 2.1 4.3-4.5" stroke="var(--good)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--bad)" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
