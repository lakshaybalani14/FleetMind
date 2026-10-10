import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Gauge, Thermometer, Waves } from "lucide-react";
import type { ReactNode } from "react";
import type { TelemetryPoint } from "@/types/fleet";
import { summarizeTelemetry } from "@/lib/telemetry-analysis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

interface Props {
  data: TelemetryPoint[];
}

function trend(delta: number, digits = 1) {
  if (Math.abs(delta) < 0.05) return { label: "Stable across this window", Icon: ArrowRight, color: "text-zinc-400" };
  return delta > 0
    ? { label: `Up ${delta.toFixed(digits)}`, Icon: ArrowUpRight, color: "text-amber-300" }
    : { label: `Down ${Math.abs(delta).toFixed(digits)}`, Icon: ArrowDownRight, color: "text-emerald-300" };
}

export function TelemetryAnalysis({ data }: Props) {
  const summary = summarizeTelemetry(data);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-2"><Activity className="h-5 w-5 text-blue-300" aria-hidden="true" /></div>
          <div>
            <CardTitle>Recent telemetry analysis</CardTitle>
            <CardDescription>Summary of the latest {summary?.count ?? 0} readings for the selected node</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-400">Analysis will appear after the first valid telemetry reading arrives.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Flagged samples" value={`${summary.alertCount} / ${summary.count}`} detail="Firmware flag or demo trigger crossing" tone={summary.alertCount ? "amber" : "green"} />
            <MetricCard icon={<Gauge className="h-4 w-4" />} label="MQ-2 relative level" value={`${summary.gasMin.toFixed(0)}–${summary.gasMax.toFixed(0)}`} detail={`Average ${summary.gasAverage.toFixed(1)} / 1000 · ${trend(summary.gasDelta, 0).label}`} tone="blue" />
            <MetricCard icon={<Thermometer className="h-4 w-4" />} label="Temperature range" value={`${summary.temperatureMin.toFixed(1)}–${summary.temperatureMax.toFixed(1)} °C`} detail={`Average ${summary.temperatureAverage.toFixed(1)} °C · ${trend(summary.temperatureDelta).label}`} tone="blue" />
            <MetricCard icon={<Waves className="h-4 w-4" />} label="Average humidity" value={`${summary.humidityAverage.toFixed(1)}%`} detail="DHT22 relative humidity" tone="blue" />
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          This is descriptive analysis of the visible recent window, not a trained model prediction. Demo triggers are MQ-2 relative level ≥ 400 or temperature ≥ 60 °C; do not interpret them as calibrated gas or safety limits.
        </p>
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "amber" | "green" | "blue" }) {
  const toneClasses = {
    amber: "border-amber-500/25 bg-amber-500/5 text-amber-300",
    green: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    blue: "border-zinc-800 bg-zinc-900/50 text-blue-300",
  }[tone];
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">{icon}{label}</div>
      <p className="mt-3 truncate text-xl font-bold text-zinc-100" title={value}>{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{detail}</p>
    </div>
  );
}
