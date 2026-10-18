"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TelemetryPoint } from "@/types/fleet";
import { demoThresholdReasons } from "@/lib/telemetry-analysis";

const PERIODS = [
  { name: "Week", days: 7 },
  { name: "Month", days: 30 },
  { name: "Quarter", days: 90 },
  { name: "Year", days: 365 },
] as const;

const COLORS = ["#c7d7ff", "#ff896f"] as const;

function hash(x: number, y: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function TelemetryDistributionDonut({ data }: { data: TelemetryPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [hoverPeriodIndex, setHoverPeriodIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const activePeriodIndex = hoverPeriodIndex ?? periodIndex;
  const period = PERIODS[activePeriodIndex];
  const filtered = useMemo(() => {
    const cutoff = Date.now() - period.days * 24 * 60 * 60 * 1000;
    return data.filter((point) => point.timestampMs >= cutoff);
  }, [data, period.days]);
  const counts = useMemo(() => {
    const flagged = filtered.filter((point) => point.isAnomaly || demoThresholdReasons(point).length > 0).length;
    return [filtered.length - flagged, flagged];
  }, [filtered]);
  const total = counts[0] + counts[1];
  const shares = useMemo(() => total ? counts.map((count) => count / total) : [0, 0], [counts, total]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size = 200;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);

    if (!total) return;
    const gap = 0.06;
    const cell = 4.8;
    const startAt = -Math.PI / 2;
    for (let x = 10; x <= 190; x += cell) {
      for (let y = 10; y <= 190; y += cell) {
        const dx = x - 100;
        const dy = y - 100;
        const distance = Math.hypot(dx, dy);
        if (distance < 56 || distance > 87) continue;
        let angle = Math.atan2(dy, dx) - startAt;
        while (angle < 0) angle += Math.PI * 2;
        while (angle >= Math.PI * 2) angle -= Math.PI * 2;
        const shareIndex = angle < shares[0] * Math.PI * 2 ? 0 : 1;
        const segmentStart = shareIndex === 0 ? 0 : shares[0] * Math.PI * 2;
        const segmentEnd = segmentStart + shares[shareIndex] * Math.PI * 2;
        if (angle < segmentStart + gap / 2 || angle > segmentEnd - gap / 2) continue;
        const faded = hoverIndex !== null && hoverIndex !== shareIndex;
        const ring = Math.max(0, Math.min(1, (distance - 56) / 31));
        const dot = cell * (0.38 + ring * 0.32 + hash(x, y) * 0.24);
        context.globalAlpha = faded ? 0.22 : 0.82;
        context.fillStyle = COLORS[shareIndex];
        context.fillRect(x - dot / 2, y - dot / 2, dot, dot);
      }
    }
    context.globalAlpha = 1;
  }, [shares, total, hoverIndex]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#141418] p-4 sm:p-5" aria-label="Reading distribution">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-100">Reading distribution</h4>
          <p className="mt-1 text-[11px] text-zinc-500">Normal and flagged telemetry</p>
        </div>
        <div className="relative isolate flex min-w-[220px] items-center rounded-full border border-white/10 bg-black/20 p-1" role="group" aria-label="Distribution period" onMouseLeave={() => setHoverPeriodIndex(null)}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 top-1 left-1 z-0 w-[calc((100%-0.5rem)/4)] rounded-full bg-blue-600 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${activePeriodIndex * 100}%)` }}
          />
          {PERIODS.map((option, index) => <button key={option.name} type="button" aria-pressed={periodIndex === index} onClick={() => setPeriodIndex(index)} onMouseEnter={() => setHoverPeriodIndex(index)} onFocus={() => setHoverPeriodIndex(index)} onBlur={() => setHoverPeriodIndex(null)} className={`relative z-10 flex-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors duration-200 ${activePeriodIndex === index ? "text-white" : "text-zinc-400 hover:text-white"}`}>{option.name}</button>)}
        </div>
      </div>
      {total === 0 ? (
        <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">No readings in the selected {period.name.toLowerCase()} window.</p>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
          <div className="relative h-[190px] w-[190px] shrink-0" aria-label={`${counts[0]} normal and ${counts[1]} flagged readings`} role="img">
            <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <span className="text-xl font-semibold tabular-nums text-zinc-100">{total.toLocaleString()}</span>
              <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">readings</span>
            </div>
          </div>
          <div className="w-full flex-1 space-y-1">
            {["Normal", "Flagged"].map((name, index) => (
              <div key={name} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)} onFocus={() => setHoverIndex(index)} onBlur={() => setHoverIndex(null)} tabIndex={0} className="flex cursor-default items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 transition hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-300/50">
                <span className="flex min-w-0 items-center gap-2.5 text-xs font-medium text-zinc-200"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index] }} />{name}</span>
                <span className="flex items-center gap-3 text-xs"><strong className="tabular-nums text-zinc-200">{counts[index].toLocaleString()}</strong><span className="w-8 text-right font-mono text-[10px] text-zinc-500">{Math.round(shares[index] * 100)}%</span></span>
              </div>
            ))}
            <p className="px-2.5 pt-1 text-[10px] leading-relaxed text-zinc-500">Flagged includes firmware anomaly flags and prototype threshold crossings.</p>
          </div>
        </div>
      )}
    </section>
  );
}
