import type { FleetNode, TelemetryPoint } from "@/types/fleet";

interface Props {
  node: FleetNode;
  telemetry: TelemetryPoint[];
  telemetryAge: string;
}

export function MonitoringBento({ node, telemetry, telemetryAge }: Props) {
  const recentGas = [...telemetry]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .slice(-11);
  const online = node.status === "online";
  const relayOn = node.actuatorState.relayActive;
  const relayLabel = node.actuatorStateStale ? "Last known" : relayOn ? "Relay on" : "Relay off";

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-6 md:auto-rows-[136px]" aria-label="Selected node status">
      <article className="relative isolate flex min-h-[260px] flex-col justify-between overflow-hidden rounded-3xl border border-slate-500/25 bg-[#202a36] p-7 text-slate-100 md:col-span-3 md:row-span-2 sm:p-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-15"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #cbd5e1 0 1px, transparent 1px 10px)",
            maskImage: "radial-gradient(ellipse 80% 55% at 100% 0%, #000 35%, transparent 110%)",
          }}
        />
        <div>
          <span className="mb-5 inline-flex rounded-full bg-white/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            Relay state · {node.name}
          </span>
          <p className={`text-5xl font-medium tracking-tight sm:text-6xl ${node.actuatorStateStale ? "text-amber-300" : relayOn ? "text-emerald-300" : "text-slate-100"}`}>
            {relayOn ? "ON" : "OFF"}
          </p>
          <p className="mt-2 text-sm font-medium text-slate-300">{relayLabel}</p>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-slate-300">
          {node.actuatorStateStale
            ? "The device is disconnected; this is its last reported relay state."
            : node.actuatorState.fanActive
              ? "Exhaust fan is running. Use Fan control below to change the relay."
              : "Fan is in standby. Use Fan control below to switch the relay."}
        </p>
      </article>

      <article className="flex min-h-[136px] items-center justify-between gap-5 rounded-3xl border border-zinc-800 bg-[#19191c] p-6 md:col-span-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">MQ-2 relative level</p>
          <p className="text-3xl font-medium tracking-tight text-zinc-100">{Math.round(node.gasLevel)}<span className="ml-1 text-base text-zinc-500">/ 1000</span></p>
          <p className="mt-1 text-xs text-zinc-500">Raw ADC {node.gasAdc ?? "—"} · demo trigger 400</p>
        </div>
        <div className="flex h-11 shrink-0 items-end gap-1" role="img" aria-label="Recent MQ-2 readings trend">
          {(recentGas.length ? recentGas : [{ gasLevel: node.gasLevel }]).map((point, index) => {
            const height = Math.max(8, Math.min(100, (point.gasLevel / 1000) * 100));
            return <span key={"timestampMs" in point ? `${point.timestampMs}-${index}` : `current-${index}`} className="w-1.5 rounded-full bg-blue-300/90" style={{ height: `${height}%` }} />;
          })}
        </div>
      </article>

      <article className={`flex min-h-[136px] flex-col items-center justify-center rounded-3xl border p-4 text-center md:col-span-1 ${online ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-amber-500/20 bg-amber-500/[0.06]"}`}>
        <span className={`mb-2 h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]" : "bg-amber-400"}`} />
        <p className={`text-lg font-semibold ${online ? "text-emerald-200" : "text-amber-200"}`}>{node.status}</p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{telemetryAge}</p>
      </article>

      <article className="flex min-h-[136px] items-center gap-4 rounded-3xl border border-zinc-800 bg-[#19191c] p-6 md:col-span-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Temperature</p>
            <p className="mt-2 whitespace-nowrap text-2xl font-medium tracking-tight text-zinc-100">{node.temperature}<span className="ml-1 text-sm text-zinc-400">°C</span></p>
          </div>
          <div className="border-l border-zinc-700 pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Humidity</p>
            <p className="mt-2 whitespace-nowrap text-2xl font-medium tracking-tight text-zinc-100">{node.humidity}<span className="ml-1 text-sm text-zinc-400">%</span></p>
          </div>
        </div>
      </article>
    </section>
  );
}
