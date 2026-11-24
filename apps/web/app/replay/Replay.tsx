"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as m from "motion/react-m";
import type { DemoData } from "@/lib/demo-schema";
import { LANE_KEYS } from "@/lib/demo-schema";
import { LAST_HOUR, LANE_LABEL, hourIndex, valuesAt } from "@/lib/replay";
import { formatRupees, shortRupees } from "@/lib/money";
import { ReplayLane, LANE_COLOR } from "@/components/ReplayLane";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { SPRING } from "@/components/ui/motion";

type LaneKey = (typeof LANE_KEYS)[number];

export function Replay({ replay, total }: { replay: DemoData["replay"]; total: number }) {
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<LaneKey>("scalpel");
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

  const rows = useMemo(() => Array.from({ length: LAST_HOUR + 1 }, (_, h) => {
    const r: Record<string, number> = { h };
    for (const k of LANE_KEYS) r[k] = replay.lanes[k].securedPaise[h]!;
    return r;
  }), [replay]);

  const chosen = valuesAt(replay.lanes[pick], hour);
  const axe = valuesAt(replay.lanes.axe, hour);
  const fill = `${(hour / LAST_HOUR) * 100}%`;

  return (
    <>
      <div className="card mt-6 p-5 sm:p-6 grid gap-5 no-print" data-testid="policy-tool">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-[17px]">Policy to test</p>
            <p className="text-[13.5px] muted">Everything else stays the same: the officer acts on {replay.k} accounts an hour in every policy.</p>
          </div>
          <Segmented label="Policy to test" value={pick} onChange={setPick} options={LANE_KEYS.map((k) => ({ value: k, label: LANE_LABEL[k], testid: `pick-${k}` }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Victim money secured" value={formatRupees(chosen.secured)} sub={`${Math.round((chosen.secured / total) * 100)}% of all victim money`} color={LANE_COLOR[pick]} />
          <Stat label="Innocent money locked" value={formatRupees(chosen.innocentLocked)} sub={pick === "axe" ? "whole balances, scam or not" : `whole freeze at this hour: ${formatRupees(axe.innocentLocked)}`} color={chosen.innocentLocked > 0 ? "var(--freeze)" : "var(--good)"} />
          <Stat label="People wrongly restricted" value={String(chosen.people)} sub={`of them shopkeepers: ${chosen.shops}`} color={chosen.people > 0 ? "var(--freeze)" : "var(--good)"} />
        </div>

        <div className="h-64 -mx-2" data-testid="replay-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="h" type="number" domain={[0, LAST_HOUR]} ticks={[0, 12, 24, 36, 48, 60, 72]} stroke="var(--muted)" fontSize={11} tickFormatter={(v) => `${v}h`} />
              <YAxis tickFormatter={shortRupees} stroke="var(--muted)" fontSize={11} width={64} />
              <Tooltip formatter={(v, n) => [formatRupees(Number(v)), LANE_LABEL[n as LaneKey] ?? String(n)]} labelFormatter={(h) => `Hour ${h}`} />
              {LANE_KEYS.map((k) => (
                <Line key={k} dataKey={k} dot={false} isAnimationActive={false} stroke={LANE_COLOR[k]} strokeWidth={k === pick ? 3 : 1.5} strokeOpacity={k === pick ? 1 : 0.35} />
              ))}
              <ReferenceLine x={hour} stroke="var(--fg)" strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[12.5px] muted -mt-2">Lines: victim money secured over the 72 hours, one per policy. The bold line is the policy you picked.</p>

        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" className="min-w-28" onClick={() => { if (hour >= LAST_HOUR) setHour(0); setPlaying((p) => !p); }}>
            <PlayIcon playing={playing} />{playing ? "Pause" : hour >= LAST_HOUR ? "Replay" : "Play"}
          </Button>
          <div className="flex-1 min-w-48">
            <div className="flex items-baseline justify-between text-sm">
              <label htmlFor="hour" className="muted">Hours after the bank decides</label>
              <span className="mono font-medium text-lg"><b data-testid="hour">{hour}</b><span className="muted text-sm font-normal"> / {LAST_HOUR}</span></span>
            </div>
            <input id="hour" type="range" min={0} max={LAST_HOUR} step={1} value={hour} aria-label="Hours after the bank decides"
              onChange={(e) => { setPlaying(false); setHour(hourIndex(Number(e.target.value))); }}
              className="scrub w-full mt-2" style={{ ["--fill" as string]: fill }} />
          </div>
        </div>
        <p className="text-xs muted">
          <span className="tag">known only afterwards</span> These counters use what really happened in the invented world, which no officer could see at the time.
        </p>
      </div>

      <h2 className="title text-[22px] mt-10">All four policies at hour <span className="mono">{hour}</span></h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {LANE_KEYS.map((k) => <ReplayLane key={k} id={k} lane={replay.lanes[k]} hour={hour} total={total} picked={k === pick} />)}
      </div>
      <p className="mt-5 text-[15px] leading-relaxed max-w-3xl">
        Read it in pairs. <b>Whole freeze vs Exact hold, biggest first:</b> same order, only the hold size differs.{" "}
        <b>Exact hold, biggest first vs Scalpel:</b> same hold sizes, only the order differs. In this small world both orders reach every
        account within a few hours, so they end level; <Link href="/order" className="link">Who first?</Link> compares orders on the 5 bigger test worlds.
        The whole freeze secures more victim money because it also catches money from victims who had not complained yet, at the cost of the innocent money it locks.
      </p>
      <p className="mt-3 text-[15px]"><Link href="/memo?a=D00191" className="link font-medium" data-testid="to-memo">See the hold memo for one shop in this world</Link></p>
    </>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card-flat lift px-4 py-3.5">
      <p className="text-[12.5px] muted">{label}</p>
      <m.p key={value} initial={{ opacity: 0.5, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mono text-[24px] font-medium mt-0.5" style={{ color }}>{value}</m.p>
      <p className="text-[12.5px] muted mt-0.5">{sub}</p>
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing
    ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" /><rect x="7.2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" /></svg>
    : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>;
}
