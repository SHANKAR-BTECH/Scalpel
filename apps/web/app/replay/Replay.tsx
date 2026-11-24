"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DemoData } from "@/lib/demo-schema";
import { LANE_KEYS } from "@/lib/demo-schema";
import { LAST_HOUR, hourIndex } from "@/lib/replay";
import { ReplayLane } from "@/components/ReplayLane";
import { Button } from "@/components/ui/Button";

export function Replay({ replay, total }: { replay: DemoData["replay"]; total: number }) {
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setHour((h) => {
        if (h >= LAST_HOUR) { setPlaying(false); return LAST_HOUR; }
        return h + 1;
      });
    }, 80);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);

  const fill = `${(hour / LAST_HOUR) * 100}%`;
  return (
    <>
      <div className="card p-5 mt-6 no-print sm:sticky sm:top-[76px] z-30" style={{ background: "var(--card)" }}>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" className="min-w-28" onClick={() => { if (hour >= LAST_HOUR) setHour(0); setPlaying((p) => !p); }}>
            <PlayIcon playing={playing} />{playing ? "Pause" : hour >= LAST_HOUR ? "Replay" : "Play"}
          </Button>
          <div className="flex-1 min-w-48">
            <div className="flex items-baseline justify-between text-sm">
              <label htmlFor="hour" className="muted">Hours after the bank decides</label>
              <span className="num font-semibold text-lg"><b data-testid="hour">{hour}</b><span className="muted text-sm font-normal"> / {LAST_HOUR}</span></span>
            </div>
            <input id="hour" type="range" min={0} max={LAST_HOUR} step={1} value={hour} aria-label="Hours after the bank decides"
              onChange={(e) => { setPlaying(false); setHour(hourIndex(Number(e.target.value))); }}
              className="scrub w-full mt-2" style={{ ["--fill" as string]: fill }} />
          </div>
        </div>
        <p className="text-xs muted mt-3">
          The officer can act on {replay.k} accounts an hour in every lane. <span className="tag">known only afterwards</span>{" "}
          These counters use what really happened in the invented world, which no officer could see at the time.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LANE_KEYS.map((k) => <ReplayLane key={k} id={k} lane={replay.lanes[k]} hour={hour} total={total} />)}
      </div>
      <p className="mt-5 text-[15px] leading-relaxed max-w-3xl">
        Read it in pairs. <b>Whole freeze vs Exact hold, biggest first:</b> same order, only the hold size differs.{" "}
        <b>Exact hold, biggest first vs Scalpel:</b> same hold sizes, only the order differs. In this small world both orders reach every
        account within a few hours, so they end level; <Link href="/order" className="link">Who first?</Link> compares orders on the 5 bigger test worlds.
        The whole freeze secures more victim money because it also catches money from victims who had not complained yet, at the cost of the innocent money it locks.
      </p>
      <p className="mt-3 text-[15px]"><Link href="/memo?a=D00191" className="link font-medium" data-testid="to-memo">See the hold memo for one shop in this world →</Link></p>
    </>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing
    ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" /><rect x="7.2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" /></svg>
    : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>;
}
