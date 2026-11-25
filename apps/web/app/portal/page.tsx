import { desk } from "@/lib/server/desk";
import { model, holderName } from "@/lib/server/world";
import { ActForm } from "@/components/ActForm";
import { holderLookup } from "@/app/actions";

export default async function Portal() {
  const d = await desk();
  const m = model();
  const demo = d.holds.filter((h) => h.hold.state === "ACTIVE").slice(-4);
  return (
    <div className="mx-auto max-w-[560px]">
      <p className="eyebrow">For account holders</p>
      <h1 className="mt-1">Is money in your account on hold?</h1>
      <p className="mt-2 muted">Enter the reference from the SMS or email your bank sent, and the last 4 digits of your mobile number. You will see how much is held, why, until when, and you can send your explanation.</p>
      <div className="card mt-5 p-5">
        <ActForm action={holderLookup} label="Show my hold" className="space-y-3" testid="lookup">
          <div><label htmlFor="ref" className="text-[13px] font-medium">Hold reference</label><input id="ref" name="ref" required placeholder="H-12345" className="input mt-1 mono uppercase" autoComplete="off" /></div>
          <div><label htmlFor="last4" className="text-[13px] font-medium">Last 4 digits of your mobile</label><input id="last4" name="last4" required inputMode="numeric" pattern="\d{4}" maxLength={4} className="input mt-1 mono w-[120px]" autoComplete="off" /></div>
        </ActForm>
      </div>
      <div className="panel mt-4 p-4 text-[13px]" data-testid="demo-helper">
        <p className="font-semibold">Demo helper</p>
        {demo.length === 0 ? <p className="mt-1 muted">No holds yet. Sign in as the officer and the supervisor to place one; its reference appears here.</p> : (
          <ul className="mt-1 space-y-0.5">{demo.map((h) => { const v = m.accounts.get(h.hold.account)!; return <li key={h.ref}><span className="mono">{h.ref}</span> · phone ending <span className="mono">{v.a.phone.slice(-4)}</span> <span className="muted">({holderName(v.a)})</span></li>; })}</ul>
        )}
        <p className="mt-2 muted">A real bank would never show this; it is here so you can try the page.</p>
      </div>
    </div>
  );
}
