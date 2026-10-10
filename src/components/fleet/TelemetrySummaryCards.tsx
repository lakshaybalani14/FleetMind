import { Droplets, ShieldAlert, ShieldCheck, Thermometer, Wind } from "lucide-react";
import type { TelemetryPoint } from "@/types/fleet";

interface Props {
  data: TelemetryPoint[];
}

export function TelemetrySummaryCards({ data }: Props) {
  const ordered = [...data].sort((a, b) => a.timestampMs - b.timestampMs);
  const latest = ordered[ordered.length - 1];
  const flaggedCount = ordered.filter((point) => point.isAnomaly || point.gasLevel >= 400 || point.temperature >= 60).length;
  const latestFlagged = Boolean(latest && (latest.isAnomaly || latest.gasLevel >= 400 || latest.temperature >= 60));
  const latestTime = latest
    ? new Date(latest.timestampMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Waiting for data";

  const summaryCards = [
    {
      label: "MQ-2 relative level",
      value: latest ? `${Math.round(latest.gasLevel)} / 1000` : "—",
      progress: latest ? Math.max(0, Math.min(100, latest.gasLevel / 10)) : 0,
      detail: "Prototype relative reading · demo trigger 400",
      accent: "emerald",
      icon: Wind,
    },
    {
      label: "Temperature",
      value: latest ? `${latest.temperature.toFixed(1)} °C` : "—",
      progress: latest ? Math.max(0, Math.min(100, (latest.temperature / 60) * 100)) : 0,
      detail: "Ambient temperature · demo trigger 60 °C",
      accent: "orange",
      icon: Thermometer,
    },
    {
      label: "Humidity",
      value: latest ? `${latest.humidity.toFixed(1)}%` : "—",
      progress: latest ? Math.max(0, Math.min(100, latest.humidity)) : 0,
      detail: "Relative humidity · latest sensor reading",
      accent: "blue",
      icon: Droplets,
    },
    {
      label: "Reading status",
      value: latest ? latestFlagged ? "Flagged" : "Normal" : "—",
      progress: ordered.length ? (flaggedCount / ordered.length) * 100 : 0,
      detail: `${flaggedCount} flagged of ${ordered.length} recent readings`,
      accent: latestFlagged ? "red" : "violet",
      icon: latestFlagged ? ShieldAlert : ShieldCheck,
    },
  ] as const;

  return (
    <section className="mx-auto max-w-5xl" aria-labelledby="recent-telemetry-title">
      <div className="mb-4">
        <h2 id="recent-telemetry-title" className="text-lg font-semibold text-zinc-100">Recent telemetry</h2>
        <p className="mt-1 text-xs text-zinc-500">Latest values · updates with the live stream</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summaryCards.map(({ label, value, progress, detail, accent, icon: Icon }) => {
          const accents = {
            emerald: { border: "border-emerald-400/30", glow: "from-emerald-500/25", bar: "bg-emerald-400", label: "text-emerald-200" },
            orange: { border: "border-orange-400/30", glow: "from-orange-500/25", bar: "bg-orange-400", label: "text-orange-200" },
            blue: { border: "border-blue-400/30", glow: "from-blue-500/25", bar: "bg-blue-400", label: "text-blue-200" },
            red: { border: "border-red-400/30", glow: "from-red-500/25", bar: "bg-red-400", label: "text-red-200" },
            violet: { border: "border-violet-400/30", glow: "from-violet-500/25", bar: "bg-violet-400", label: "text-violet-200" },
          }[accent];
          return (
            <article key={label} className={`relative flex min-h-[210px] flex-col justify-between overflow-hidden rounded-3xl border bg-[#141418] p-5 shadow-lg sm:p-6 ${accents.border}`}>
              <div aria-hidden="true" className={`pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-gradient-to-br ${accents.glow} to-transparent blur-2xl`} />
              <div className="relative flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-400">{latestTime}</p>
                <Icon className={`h-4 w-4 ${accents.label}`} aria-hidden="true" />
              </div>
              <div className="relative py-5 text-center">
                <h3 className="text-sm font-semibold capitalize text-zinc-100">{label}</h3>
                <p className={`mt-2 text-3xl font-semibold tracking-tight ${label === "Reading status" && latestFlagged ? "text-red-200" : "text-zinc-100"}`}>{value}</p>
              </div>
              <div className="relative">
                <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{label === "Reading status" ? "Flagged in recent window" : "Current level"}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${accents.bar}`} style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{detail}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
