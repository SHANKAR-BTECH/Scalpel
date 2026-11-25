import Link from "next/link";
import { loginAs } from "@/app/actions";
import { USERS } from "@/lib/users";

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <div className="mx-auto max-w-[980px]">
      <p className="eyebrow">Demo sign-in</p>
      <h1 className="mt-1">Who are you today?</h1>
      <p className="mt-2 max-w-[640px] muted">Pick a person. Each one sees only their own pages. Open two browsers (or a normal and a private window) as two people to watch requests and approvals arrive live.</p>
      {denied && <p className="mt-3 chip chip-warn">That page is for another role. Sign in as the right person.</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {USERS.map((u) => (
          <form key={u.id} action={loginAs} className="card lift flex flex-col p-4">
            <input type="hidden" name="user" value={u.id} />
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-full text-[14px] font-bold text-white ${u.role === "telco" ? "bg-[var(--phone)]" : "bg-[var(--accent)]"}`}>{u.name.split(" ").map((x) => x[0]).join("")}</span>
              <span className="leading-tight"><span className="block font-semibold">{u.name}</span><span className="block text-[13px] muted">{u.title}, {u.org}</span></span>
            </div>
            <ul className="mt-3 flex-1 space-y-1 text-[13.5px] muted">{u.can.map((c) => <li key={c}>• {c}</li>)}</ul>
            <button className="btn btn-primary mt-4 w-full" data-testid={`login-${u.id}`}>Sign in as {u.name.split(" ")[0]}</button>
          </form>
        ))}
        <div className="panel flex flex-col p-4">
          <p className="font-semibold">Account holder</p>
          <p className="mt-1 flex-1 text-[13.5px] muted">Someone whose money is on hold signs in with the hold reference from their SMS and the last 4 digits of their phone.</p>
          <Link href="/portal" className="btn btn-ghost mt-4 w-full">Go to the account holder page</Link>
        </div>
      </div>
    </div>
  );
}
