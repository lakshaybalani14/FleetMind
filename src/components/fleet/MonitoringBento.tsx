import type { FleetNode, TelemetryPoint } from "@/types/fleet";
import { LiveCounter } from "./LiveCounter";
import { RockerSwitch } from "@/components/ui/RockerSwitch";

interface Props {
  node: FleetNode;
  telemetry: TelemetryPoint[];
  telemetryAge: string;
  automationEnabled: boolean;
  relayPending: boolean;
  controlsDisabled: boolean;
  onToggleAutomation: () => void;
  onToggleRelay: () => void;
}

export function MonitoringBento({ node, telemetry, telemetryAge, automationEnabled, relayPending, controlsDisabled, onToggleAutomation, onToggleRelay }: Props) {
  const recentGas = [...telemetry]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .slice(-11);
  const online = node.status === "online";
  const relayOn = node.actuatorState.relayActive;

  return (
    <section className="grid grid-cols-1 gap-3 overflow-hidden rounded-3xl bg-[#202a36] py-3 pr-3 md:grid-cols-6 md:auto-rows-[120px]" aria-label="Selected node status">
      <article className="relative isolate flex min-h-[288px] flex-col justify-between overflow-hidden rounded-2xl bg-transparent px-6 pb-8 pt-5 text-slate-100 md:col-span-3 md:row-span-2 sm:px-9 sm:pb-10 sm:pt-6">
        <div>
          <span className="mb-5 inline-flex rounded-full bg-white/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            Relay state · {node.name}
          </span>
          <p className={`text-5xl font-medium tracking-tight sm:text-6xl ${node.actuatorStateStale ? "text-amber-300" : relayOn ? "text-emerald-300" : "text-slate-100"}`}>
            {relayOn ? "ON" : "OFF"}
          </p>
        </div>
        <div className="mt-4 pt-2">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-200/65">Relay controls</p>
          <div className="flex flex-wrap items-center justify-start gap-x-6 gap-y-3">
            <button type="button" onClick={onToggleAutomation} disabled={controlsDisabled}
              className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-blue-200/40 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50">
              {automationEnabled ? "Switch to manual" : "Enable automatic"}
            </button>
            <div className="relative flex items-center">
              <RockerSwitch label="Fan relay" checked={relayOn} onChange={onToggleRelay} disabled={controlsDisabled || relayPending || !online || node.actuatorStateStale} />
            </div>
          </div>
        </div>
      </article>

      <article className="flex min-h-[120px] items-center justify-between gap-5 rounded-[20px] border border-zinc-800/70 bg-[#19191c] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] md:col-span-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">MQ-2 relative level</p>
          <p className="text-3xl font-medium tracking-tight text-zinc-100"><LiveCounter value={Math.round(node.gasLevel)} /><span className="ml-1 text-base text-zinc-500">/ 1000</span></p>
          <p className="mt-1 text-xs text-zinc-500">Raw ADC {node.gasAdc ?? "—"} · demo trigger 400</p>
        </div>
        <div className="flex h-11 shrink-0 items-end gap-1" role="img" aria-label="Recent MQ-2 readings trend">
          {(recentGas.length ? recentGas : [{ gasLevel: node.gasLevel }]).map((point, index) => {
            const height = Math.max(8, Math.min(100, (point.gasLevel / 1000) * 100));
            return <span key={"timestampMs" in point ? `${point.timestampMs}-${index}` : `current-${index}`} className="w-1.5 rounded-full bg-blue-300/90" style={{ height: `${height}%` }} />;
          })}
        </div>
      </article>

      <article className={`flex min-h-[120px] flex-col items-center justify-center rounded-[20px] border p-3 text-center md:col-span-1 ${online ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-amber-500/25 bg-amber-500/[0.06]"}`}>
        <span className={`mb-2 h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]" : "bg-amber-400"}`} />
        <p className={`text-lg font-semibold tracking-wide ${online ? "text-emerald-200" : "text-amber-200"}`}>{node.status.toUpperCase()}</p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{telemetryAge}</p>
      </article>

      <article className="flex min-h-[120px] items-center gap-4 rounded-[20px] border border-zinc-800/70 bg-[#19191c] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] md:col-span-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Temperature</p>
            <p className="mt-2 whitespace-nowrap text-2xl font-medium tracking-tight text-zinc-100"><LiveCounter value={node.temperature} decimals={1} /><span className="ml-1 text-sm text-zinc-400">°C</span></p>
          </div>
          <div className="border-l border-zinc-700 pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Humidity</p>
            <p className="mt-2 whitespace-nowrap text-2xl font-medium tracking-tight text-zinc-100"><LiveCounter value={node.humidity} decimals={1} /><span className="ml-1 text-sm text-zinc-400">%</span></p>
          </div>
        </div>
      </article>
    </section>
  );
}
