import { Stagger } from "@/components/Stagger";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loginAs } from "@/app/actions";
import { USERS } from "@/lib/users";

const ORGS = ["Bharat Demo Bank", "Telco-A", "Scalpel demo"];

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <div className="mx-auto max-w-[880px]">
      <h1>Who are you today?</h1>
      <p className="mt-2 max-w-[640px] muted">Each person sees only their own work. Open a second browser window as someone else to watch requests and approvals arrive live.</p>
      {denied && <p className="mt-3 chip chip-warn">That page is for another role. Sign in as the right person.</p>}
      <div className="mt-6 space-y-6">
        {ORGS.map((org) => (
          <section key={org}>
            <h2 className="label">{org}</h2>
            <Stagger as="ul" className="card board mt-2">
              {USERS.filter((u) => u.org === org).map((u) => (
                <li key={u.id} className="board-row">
                  <form action={loginAs} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                    <input type="hidden" name="user" value={u.id} />
                    <span className="mono grid h-10 w-10 shrink-0 place-items-center border border-[#0d0d0d] text-[13px] font-medium">{u.name.split(" ").map((x) => x[0]).join("")}</span>
                    <span className="min-w-[220px] flex-1 leading-snug">
                      <span className="block font-semibold">{u.name} <span className="font-normal muted">· {u.title}</span></span>
                      <span className="block text-[13.5px] muted">{u.can.join(". ")}.</span>
                    </span>
                    <button className="btn btn-sm" data-testid={`login-${u.id}`}>Sign in as {u.name.split(" ")[0]}</button>
                  </form>
                </li>
              ))}
            </Stagger>
          </section>
        ))}
        <Link href="/portal" className="sheet flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/80">
          <span className="flex-1"><span className="block font-semibold">Account holder</span><span className="block text-[13.5px] muted">Money on hold? Sign in with the reference from your SMS and the last 4 digits of your phone.</span></span>
          <ArrowRight size={18} className="text-[var(--muted)]" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
