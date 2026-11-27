"use client";
/** Imran's answer to a police request: release as asked, release less (some numbers, fewer days), or refuse with a
 *  reply to the officer. Nothing is chosen for him; the server checks his checks were done before anything leaves. */
import { useState } from "react";
import { ActForm } from "./ActForm";
import { leaDecideAction } from "@/app/actions";

export function LeaDecideForm({ req, numbers, from, to, reasons, ready }: {
  req: string; numbers: string[]; from: string; to: string; reasons: readonly string[]; ready: { officer: boolean; callback: boolean; looked: string[] };
}) {
  const [out, setOut] = useState<"RELEASE" | "NARROW" | "REFUSE" | null>(null);
  const missing = [!ready.officer && "look the officer up", out !== "REFUSE" && !ready.callback && "call the station back"].filter(Boolean) as string[];
  return (
    <ActForm action={leaDecideAction} hidden={{ req }} label="Send the answer" variant="phone" testid="lea-decide" className="mt-3 space-y-3" disabled={!out}>
      <fieldset className="space-y-1.5 text-[14px]">
        {([["RELEASE", "Release as asked"], ["NARROW", "Release less than asked"], ["REFUSE", "Refuse"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-white/70 has-[:checked]:bg-[var(--accent-tint)]">
            <input type="radio" name="outcome" value={k} checked={out === k} onChange={() => setOut(k)} className="accent-[var(--phone)]" data-testid={`lea-${k}`} />{l}
          </label>
        ))}
      </fieldset>
      {out === "NARROW" && (
        <div className="space-y-2 rounded-2xl border border-[var(--line)] p-3 text-[13.5px]" data-testid="lea-narrow">
          <p className="label">Numbers to release</p>
          {numbers.map((n) => (
            <label key={n} className="flex items-center gap-2"><input type="checkbox" name="number" value={n} className="accent-[var(--phone)]" data-testid="lea-pick" />
              <span className="mono">{n}</span>{!ready.looked.includes(n) && <span className="text-[12px] text-[var(--warn)]">not looked up yet</span>}</label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">From</span><input type="date" name="from" defaultValue={from} min={from} max={to} className="input mt-1" data-testid="lea-from" /></label>
            <label><span className="label">To</span><input type="date" name="to" defaultValue={to} min={from} max={to} className="input mt-1" data-testid="lea-to" /></label>
          </div>
        </div>
      )}
      <label className="block"><span className="label">Reason</span>
        <select name="reason" className="input mt-1" defaultValue="" data-testid="lea-reason">
          <option value="" disabled>Pick a reason…</option>
          {reasons.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <textarea name="note" rows={3} className="input" placeholder={out === "RELEASE" ? "Note (optional)" : "Your reply to the officer: what was left out or refused, and why"} data-testid="lea-note" />
      {out && missing.length > 0 && <p className="text-[12.5px] text-[var(--warn)]">Still to do before this can go: {missing.join(", ")}.</p>}
    </ActForm>
  );
}
