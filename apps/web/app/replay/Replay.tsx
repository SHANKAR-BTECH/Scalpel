"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DemoData } from "@/lib/demo-schema";
import { LANE_KEYS } from "@/lib/demo-schema";
import { LAST_HOUR, hourIndex } from "@/lib/replay";
import { ReplayLane } from "@/components/ReplayLane";

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

  return (
    <>
      <div className="card p-4 mt-4 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-md px-3 py-1.5 text-white" style={{ background: "var(--s1)" }}
            onClick={() => { if (hour >= LAST_HOUR) setHour(0); setPlaying((p) => !p); }}>
            {playing ? "Pause" : hour >= LAST_HOUR ? "Replay" : "Play"}
          </button>
          <label htmlFor="hour" className="text-sm">Hours after the bank decides: <b data-testid="hour">{hour}</b></label>
          <input id="hour" type="range" min={0} max={LAST_HOUR} step={1} value={hour} aria-label="Hours after the bank decides"
            onChange={(e) => { setPlaying(false); setHour(hourIndex(Number(e.target.value))); }} className="flex-1 min-w-40" />
        </div>
        <p className="text-xs muted mt-2">
          The officer can act on {replay.k} accounts an hour in every lane. <span className="tag">known only afterwards</span>{" "}
          These counters use what really happened in the invented world, which no officer could see at the time.
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LANE_KEYS.map((k) => <ReplayLane key={k} id={k} lane={replay.lanes[k]} hour={hour} total={total} />)}
      </div>
      <p className="mt-3 text-sm muted">
        Read it in pairs. <b>Whole freeze vs Exact hold, biggest first:</b> same order, only the hold size differs.{" "}
        <b>Exact hold, biggest first vs Scalpel:</b> same hold sizes, only the order differs. In this small world both orders reach every
        account within a few hours, so they end level; <Link href="/order" className="underline">Who first?</Link> compares orders on the 5 bigger test worlds.
        The whole freeze secures more victim money because it also catches money from victims who had not complained yet, at the cost of the innocent money it locks.
      </p>
      <p className="mt-2 text-sm"><Link href="/memo?a=D00191" className="underline" data-testid="to-memo">See the hold memo for one shop in this world →</Link></p>
    </>
  );
}
