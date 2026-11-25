"use client";
/** A form that runs a server action and shows its answer right under the button. */
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { Result } from "@/app/actions";

type Act = (prev: Result | null, f: FormData) => Promise<Result>;

export function ActForm({ action, children, label, variant = "primary", size, className = "", hidden, testid, pendingLabel }: {
  action: Act; children?: React.ReactNode; label: React.ReactNode; variant?: "primary" | "ghost" | "danger" | "phone"; size?: "sm";
  className?: string; hidden?: Record<string, string | number>; testid?: string; pendingLabel?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState(async (prev: Result | null, f: FormData) => {
    const r = await action(prev, f);
    // Clear what was typed once it is saved, so it can never ride along to the next item.
    if (r?.ok) form.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[type=text], input:not([type]), textarea").forEach((el) => { el.value = ""; });
    // Also shown at the corner of the screen: the button may disappear once the page refreshes (e.g. an approved item).
    if (r) window.dispatchEvent(new CustomEvent("scalpel-flash", { detail: r }));
    return r;
  }, null);
  const [shown, setShown] = useState<Result | null>(null);
  useEffect(() => { if (state) { setShown(state); const t = setTimeout(() => setShown(null), 7000); return () => clearTimeout(t); } }, [state]);
  return (
    <form ref={form} autoComplete="off" className={className} onSubmit={(e) => {
      // Submit without React's automatic form reset, so typed values stay if the answer is "try again".
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      startTransition(() => run(f));
    }}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
      {children}
      <button type="submit" disabled={pending} data-testid={testid} className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""}`}>
        {pending ? (pendingLabel ?? "Saving…") : label}
      </button>
      {shown && (
        <p role="status" data-testid={testid ? `${testid}-result` : undefined} className={`mt-2 text-[13px] ${shown.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
          {shown.message}
        </p>
      )}
    </form>
  );
}
