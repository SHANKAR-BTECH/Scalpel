import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { store } from "@/lib/server/store";
import { ActForm } from "@/components/ActForm";
import { clockAction, resetAction } from "@/app/actions";
import { START } from "@/lib/server/world";
import { when } from "@/lib/format";
import { USERS } from "@/lib/users";

export default async function Admin() {
  await requireUser("admin");
  const s = await store();
  const d = await desk();
  const days = Math.floor((d.now - START) / 86_400_000);
  return (
    <div className="max-w-[900px]">
      <h1 className="mt-1">Demo controls</h1>
      <section className="mt-5 card p-4" data-testid="db-status">
        <h2>Shared database</h2>
        {s.kind === "postgres"
          ? <p className="mt-2 chip chip-good">Connected to Postgres: everyone sees the same desk.</p>
          : <><p className="mt-2 chip chip-warn">Not connected: using this server&apos;s memory.</p>
            <p className="mt-2 text-[13.5px] muted">Fine on one computer. On the live site different visitors may see different copies and a restart wipes it. To share one desk: in Vercel open the project, Storage, add a Neon Postgres database and connect it to this project (it sets DATABASE_URL), then redeploy.</p></>}
        <p className="mt-2 text-[13px] muted">{d.chain.length} records in the audit log.</p>
      </section>
      <section className="mt-4 card p-4">
        <h2>Demo clock</h2>
        <p className="mt-1 text-[14px]">Now: <span className="font-semibold" data-testid="admin-now">{when(d.now, true)}</span> <span className="muted">(day {days} of the demo)</span></p>
        <p className="mt-1 text-[13.5px] muted">Jump forward to show deadlines turning amber and red on the Holds page. Time only moves forward; reset to go back.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 7, 30].map((n) => <ActForm key={n} action={clockAction} hidden={{ days: n }} label={`+${n} day${n > 1 ? "s" : ""}`} variant="ghost" size="sm" testid={`clock-${n}`} />)}
        </div>
      </section>
      <section className="mt-4 card p-4">
        <h2>Reset</h2>
        <p className="mt-1 text-[13.5px] muted">Deletes every hold, request, message and record, and puts the clock back. Use before a demo.</p>
        <ActForm action={resetAction} label="Reset the demo" variant="danger" className="mt-3" testid="reset" />
      </section>
      <section className="mt-4 card p-4">
        <h2>People</h2>
        <ul className="mt-2 divide-y divide-[var(--line)] text-[14px]">
          {USERS.map((u) => <li key={u.id} className="flex justify-between py-2"><span>{u.name}</span><span className="muted">{u.title}, {u.org}</span></li>)}
        </ul>
        <p className="mt-2 text-[13px] muted">Sign out and <Link className="link" href="/login">sign in as someone else</Link>.</p>
      </section>
    </div>
  );
}
