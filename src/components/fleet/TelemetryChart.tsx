import React, { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { TelemetryPoint } from "@/types/fleet";
import { Thermometer, Wind } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

interface Props {
  data: TelemetryPoint[];
  nodeName: string;
}

export function TelemetryChart({ data, nodeName }: Props) {
  const [metric, setMetric] = useState<"gasLevel" | "temperature">("gasLevel");
  const hasAnomaly = data.some((d) => d.isAnomaly);

  const config = {
    gasLevel: {
      label: "MQ-2 Gas / Smoke",
      unit: "PPM",
      color: hasAnomaly ? "#f87171" : "#60a5fa",
      threshold: 500,
      icon: Wind,
    },
    temperature: {
      label: "DHT22 Temperature",
      unit: "°C",
      color: "#34d399",
      threshold: 35,
      icon: Thermometer,
    },
  }[metric];

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <CardTitle>{nodeName}</CardTitle>
            </div>
            <CardDescription>Real-time Telemetry Analytics Feed</CardDescription>
          </div>
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setMetric("gasLevel")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center space-x-1.5 ${
                metric === "gasLevel" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Gas / Smoke</span>
            </button>
            <button
              onClick={() => setMetric("temperature")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center space-x-1.5 ${
                metric === "temperature" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Temperature</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="timestamp" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "12px", color: "#f4f4f5" }}
                labelStyle={{ color: "#a1a1aa", fontSize: "12px" }}
              />
              {config.threshold && (
                <ReferenceLine
                  y={config.threshold}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: `Threshold (${config.threshold} ${config.unit})`, fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                />
              )}
              <Area type="monotone" dataKey={metric} stroke={config.color} strokeWidth={2.5} fillOpacity={1} fill="url(#metricGradient)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
