"use client";
/** Live updates: asks the server every 4 seconds whether anything changed; if so, redraws the page and rings the bell. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markReadAction } from "@/app/actions";
import { ago } from "@/lib/format";

interface Note { id: number; at: number; text: string; link: string; read: boolean }

export function LiveBell({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Note | null>(null);
  const version = useRef<string | null>(null);
  const seen = useRef<number>(-1);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/feed", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const j = (await r.json()) as { version: string; now: number; notes: Note[] };
        setNotes(j.notes); setNow(j.now);
        const top = j.notes[0]?.id ?? 0;
        if (seen.current >= 0 && top > seen.current && j.notes[0] && !j.notes[0].read) setToast(j.notes[0]);
        seen.current = top;
        if (version.current !== null && version.current !== j.version) router.refresh();
        version.current = j.version;
      } catch { /* offline: try again next tick */ }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [router]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); } }, [toast]);
  if (!signedIn) return null;
  const unread = notes.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button type="button" aria-label={`Notifications, ${unread} unread`} data-testid="bell" aria-expanded={open}
        onClick={async () => { setOpen((o) => !o); if (!open && unread) { await markReadAction(); setNotes((ns) => ns.map((n) => ({ ...n, read: true }))); } }}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-white hover:bg-[var(--panel)]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span data-testid="bell-count" className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--bad)] px-1 text-[11px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-32px))] card p-2" data-testid="bell-list">
          <p className="eyebrow px-2 py-1">Notifications</p>
          {notes.length === 0 && <p className="px-2 py-3 text-sm muted">Nothing yet.</p>}
          <ul className="max-h-[60vh] overflow-auto">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={n.link} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-[13.5px] hover:bg-[var(--panel)]">
                  {n.text}<span className="mt-0.5 block text-[11.5px] muted">{ago(n.at, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {toast && (
        <div role="status" data-testid="toast" className="fixed bottom-4 right-4 z-[60] w-[min(380px,calc(100vw-32px))] card border-[var(--accent-line)] p-3 text-[13.5px]">
          <p className="eyebrow mb-1 text-[var(--accent)]">New</p>
          <Link href={toast.link} className="hover:underline" onClick={() => setToast(null)}>{toast.text}</Link>
        </div>
      )}
    </div>
  );
}
