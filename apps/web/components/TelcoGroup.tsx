"use client";
/** Telco-A's work beyond the one alert: the linked SIMs he pinned (same ID or same batch) and the shops he pinned.
 *  He ticks which SIMs an action covers; the server refuses a block that still sweeps up a genuine customer and
 *  says who. A shop is suspended only when his pins hold the shop and a reused ID document sold there. */
import { useState } from "react";
import { Store, Users } from "lucide-react";
import { ActForm } from "./ActForm";
import { telcoGroupAction, telcoShopAction } from "@/app/actions";
import { when } from "@/lib/format";

export interface GroupView {
  anchor: string; note: string; overLimit: boolean; docCount: number;
  rows: { msisdn: string; kycName: string; why: string[]; pos: string; activatedAt: number; ownerYears: number; callsOut: number; callsIn: number; acted: string | null }[];
}
export interface GroupLogView { action: string; sims: number; outcome: "DONE" | "REFUSED"; refused: string[]; by: string; at: number }
export interface ShopView { pos: string; name: string; verified: boolean; docs: { doc: string; sims: number }[]; status: { outcome: "SUSPENDED" | "REFUSED"; why: string; at: number } | null }

export function TelcoGroup({ alert, groups, log, shops, labels }: { alert: string; groups: GroupView[]; log: GroupLogView[]; shops: ShopView[]; labels: Record<string, string> }) {
  if (!groups.length && !shops.length && !log.length) return null;
  return (
    <section className="card p-5" data-testid="group-panel">
      <h2 className="flex items-center gap-2"><Users size={17} className="text-[var(--phone)]" aria-hidden />Beyond this alert: linked SIMs and shops</h2>
      <p className="mt-0.5 text-[13.5px] muted">From the linked SIMs and shops you pinned. Tick the SIMs an action covers. Telco-A refuses to block or re-verify a long-time customer or a registered business. It says how many you ticked, not which: you find them.</p>
      {groups.map((g) => <Group key={g.anchor} alert={alert} g={g} labels={labels} />)}
      {log.length > 0 && (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <p className="label">Group actions on record</p>
          <ul className="mt-1.5 space-y-1.5 text-[13px]" data-testid="group-log">
            {log.map((x, i) => (
              <li key={i} data-testid="group-log-row" data-outcome={x.outcome}>
                <span className={`chip ${x.outcome === "DONE" ? "chip-good" : "chip-warn"} mr-1.5`}>{x.outcome === "DONE" ? "Done" : "Near miss"}</span>
                {x.action} · {x.sims} SIM{x.sims === 1 ? "" : "s"} · {x.by} · {when(x.at)}
                {x.refused.length > 0 && <span className="block text-[12.5px] text-[var(--warn)]">Refused: {x.refused.length} ticked SIM{x.refused.length === 1 ? "" : "s"} looked like a genuine customer. Nothing was changed.</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {shops.map((s) => (
        <div key={s.pos} className="mt-4 border-t border-[var(--line)] pt-3 text-[13.5px]" data-testid="shop-panel">
          <p className="flex flex-wrap items-center gap-2 font-medium"><Store size={15} aria-hidden />{s.name} <span className="mono text-[12.5px] muted">{s.pos}</span>
            <span className={`chip ${s.verified ? "chip-good" : "chip-warn"}`}>{s.verified ? "Verified shop" : "Not verified"}</span></p>
          <p className="mt-1 text-[13px]">{s.docs.length ? <>Your pinned ID documents sold here: {s.docs.map((d) => `${d.doc} (${d.sims} SIMs)`).join(", ")}.</> : <span className="muted">You have pinned no ID document sold at this shop.</span>}</p>
          {s.status?.outcome === "SUSPENDED" ? <p className="mt-2 chip chip-good" data-testid="shop-done">Suspended and reported to DoT · {when(s.status.at)}</p> : (
            <>
              {s.status && <p className="mt-1 text-[12.5px] text-[var(--warn)]">Last try refused: {s.status.why}</p>}
              <ActForm action={telcoShopAction} hidden={{ alert, pos: s.pos }} label="Suspend the shop and report it to DoT" variant="ghost" size="sm" testid="shop-suspend" className="mt-2" />
            </>
          )}
        </div>
      ))}
    </section>
  );
}

function Group({ alert, g, labels }: { alert: string; g: GroupView; labels: Record<string, string> }) {
  const [on, setOn] = useState<Set<string>>(new Set());
  const open = g.rows.filter((r) => !r.acted);
  const flip = (n: string) => setOn((x) => { const y = new Set(x); if (y.has(n)) y.delete(n); else y.add(n); return y; });
  return (
    <div className="mt-4" data-testid="group-box">
      <p className="text-[13.5px]"><b>Linked to {g.anchor}.</b> {g.note}</p>
      {g.overLimit && <p className="mt-1 chip chip-warn">Over DoT&apos;s limit: {g.docCount} SIMs on one person&apos;s ID</p>}
      <ActForm action={telcoGroupAction} hidden={{ alert, anchor: g.anchor }} label="Record the group action" variant="phone" testid="group-act" className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <button type="button" className="link" onClick={() => setOn(new Set(open.map((r) => r.msisdn)))} data-testid="group-all">Tick all</button>
          <button type="button" className="link" onClick={() => setOn(new Set())}>Untick all</button>
          <span className="muted">{on.size} ticked</span>
        </div>
        <div className="max-h-[340px] overflow-auto">
          <table className="table w-full min-w-[600px] text-[13px]">
            <thead><tr><th /><th>SIM</th><th>Name on the SIM</th><th>Why linked</th><th>Since</th><th>Calls out · in</th></tr></thead>
            <tbody>{g.rows.map((r) => (
              <tr key={r.msisdn} data-testid="group-pick-row">
                <td>{r.acted ? <span className="chip chip-grey">{r.acted}</span> : <input type="checkbox" name="sim" value={r.msisdn} checked={on.has(r.msisdn)} onChange={() => flip(r.msisdn)} aria-label={`Tick ${r.msisdn}`} data-testid="group-pick" />}</td>
                <td className="mono">{r.msisdn}</td><td>{r.kycName}</td><td>{r.why.join(", ")}</td>
                <td className="whitespace-nowrap">{new Date(r.activatedAt).getFullYear()}{r.ownerYears > 0 && <span className="muted"> ({r.ownerYears} yr{r.ownerYears > 1 ? "s" : ""})</span>}</td>
                <td>{r.callsOut} · {r.callsIn}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-[13.5px]">
          <legend className="label mb-1">Do this to the ticked SIMs</legend>
          {Object.entries(labels).map(([k, v]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="radio" name="action" value={k} defaultChecked={k === "REVERIFY"} data-testid={`group-${k}`} className="accent-[var(--phone)]" />{v}</label>
          ))}
        </fieldset>
        <input name="note" className="input" placeholder="Note (what you checked)" />
      </ActForm>
    </div>
  );
}
