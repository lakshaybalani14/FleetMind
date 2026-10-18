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
      value: latest ? `${Math.round(latest.gasLevel)}` : "—",
      unit: "/ 1000",
      progress: latest ? Math.max(0, Math.min(100, latest.gasLevel / 10)) : 0,
      detail: "Prototype relative reading · demo trigger 400",
      accent: "emerald",
      icon: Wind,
    },
    {
      label: "Temperature",
      value: latest ? latest.temperature.toFixed(1) : "—",
      unit: "°C",
      progress: latest ? Math.max(0, Math.min(100, (latest.temperature / 60) * 100)) : 0,
      detail: "Ambient temperature · demo trigger 60 °C",
      accent: "orange",
      icon: Thermometer,
    },
    {
      label: "Humidity",
      value: latest ? latest.humidity.toFixed(1) : "—",
      unit: "%",
      progress: latest ? Math.max(0, Math.min(100, latest.humidity)) : 0,
      detail: "Relative humidity · latest sensor reading",
      accent: "blue",
      icon: Droplets,
    },
    {
      label: "Reading status",
      value: latest ? latestFlagged ? "Flagged" : "Normal" : "—",
      unit: "Latest reading",
      progress: ordered.length ? (flaggedCount / ordered.length) * 100 : 0,
      detail: `${flaggedCount} flagged of ${ordered.length} recent readings`,
      accent: latestFlagged ? "red" : "violet",
      icon: latestFlagged ? ShieldAlert : ShieldCheck,
    },
  ] as const;

  return (
    <section className="w-full" aria-labelledby="recent-telemetry-title">
      <div className="mb-4">
        <h2 id="recent-telemetry-title" className="text-lg font-semibold text-zinc-100">Recent telemetry</h2>
        <p className="mt-1 text-xs text-zinc-500">Latest values · updates with the live stream</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summaryCards.map(({ label, value, unit, progress, detail, accent, icon: Icon }) => {
          const accents = {
            emerald: { border: "border-emerald-400/30", glow: "from-emerald-500/25", bar: "bg-emerald-400", label: "text-emerald-200", arc: "stroke-emerald-400", circle: "border-emerald-400/45 from-emerald-300/20 via-emerald-500/10 to-emerald-950/25 ring-emerald-400/5 shadow-[0_0_30px_rgba(52,211,153,0.12)]" },
            orange: { border: "border-orange-400/30", glow: "from-orange-500/25", bar: "bg-orange-400", label: "text-orange-200", arc: "stroke-orange-400", circle: "border-orange-400/45 from-orange-300/20 via-orange-500/10 to-orange-950/25 ring-orange-400/5 shadow-[0_0_30px_rgba(251,146,60,0.12)]" },
            blue: { border: "border-blue-400/30", glow: "from-blue-500/25", bar: "bg-blue-400", label: "text-blue-200", arc: "stroke-blue-400", circle: "border-blue-400/45 from-blue-300/20 via-blue-500/10 to-blue-950/25 ring-blue-400/5 shadow-[0_0_30px_rgba(96,165,250,0.12)]" },
            red: { border: "border-red-400/30", glow: "from-red-500/25", bar: "bg-red-400", label: "text-red-200", arc: "stroke-red-400", circle: "border-red-400/45 from-red-300/20 via-red-500/10 to-red-950/25 ring-red-400/5 shadow-[0_0_30px_rgba(248,113,113,0.12)]" },
            violet: { border: "border-violet-400/30", glow: "from-violet-500/40", bar: "bg-violet-300", label: "text-violet-200", arc: "stroke-violet-300", circle: "border-violet-300/55 from-violet-300/30 via-violet-500/20 to-violet-950/35 ring-violet-400/10 shadow-[0_0_34px_rgba(167,139,250,0.2)]" },
          }[accent];
          return (
            <article key={label} className={`relative flex h-[210px] flex-col justify-between overflow-hidden rounded-3xl border bg-[#141418] p-5 shadow-lg sm:p-6 ${accents.border}`}>
              <div aria-hidden="true" className={`pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-gradient-to-br ${accents.glow} to-transparent blur-2xl`} />
              <div className="relative flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-400">{latestTime}</p>
                <Icon className={`h-4 w-4 ${accents.label}`} aria-hidden="true" />
              </div>
              <div className="relative flex h-[112px] shrink-0 items-center">
                <div className="relative z-[1] min-w-0 flex-1 pr-3">
                  <h3 className={`text-sm font-semibold capitalize ${accents.label}`}>{label}</h3>
                  <p className="mt-2 max-w-[30ch] text-[11px] leading-relaxed text-zinc-500">{detail}</p>
                </div>
                <div className={`relative z-10 flex h-[76px] w-[76px] shrink-0 flex-col items-center justify-center rounded-full border bg-[#141418] bg-gradient-to-br ring-2 ${accents.circle}`}>
                  <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 76 76" aria-hidden="true">
                    <path d="M 38 76 A 38 38 0 1 1 38 0 A 38 38 0 1 1 38 76" fill="none" className={accents.arc} strokeWidth="4" strokeLinecap="butt" />
                  </svg>
                  <p className={`relative z-[1] font-semibold tracking-tight tabular-nums ${label === "Reading status" ? "text-sm" : "text-xl"} ${accents.label}`}>{value}</p>
                  <span className={`relative z-[1] mt-0.5 text-[9px] ${accents.label} opacity-70`}>{unit}</span>
                </div>
                <div className={`absolute bottom-4 left-0 right-[38px] z-0 h-1 overflow-hidden rounded-full ${accent === "violet" && latest ? "bg-gradient-to-r from-violet-950/70 via-violet-700/50 to-violet-300" : "bg-zinc-800"}`}>
                  <div className={`ml-auto h-full rounded-l-full rounded-r-none transition-[width] duration-500 ${accents.bar}`} style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="relative flex items-center justify-between text-[10px] text-zinc-500">
                <span>{label === "Reading status" ? "Flagged in recent window" : "Current level"}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
