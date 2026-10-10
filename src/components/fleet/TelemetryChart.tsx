import React, { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot } from "recharts";
import { TelemetryPoint } from "@/types/fleet";
import { Thermometer, Wind } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

interface Props {
  data: TelemetryPoint[];
  nodeName: string;
  isLive: boolean;
}

export function TelemetryChart({ data, nodeName, isLive }: Props) {
  const [metric, setMetric] = useState<"gasLevel" | "temperature">("gasLevel");
  const hasAnomaly = data.some((d) => d.isAnomaly);

  const config = {
    gasLevel: {
      label: "MQ-2 Relative Level (not CO ppm)",
      unit: "/ 1000",
      color: hasAnomaly ? "#f87171" : "#60a5fa",
      threshold: 400,
      icon: Wind,
    },
    temperature: {
      label: "DHT22 Temperature",
      unit: "°C",
      color: "#34d399",
      threshold: 60,
      icon: Thermometer,
    },
  }[metric];

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className={`h-2 w-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
              <CardTitle>{nodeName}</CardTitle>
            </div>
            <CardDescription>{isLive ? "Live telemetry updates active" : "Waiting for live telemetry updates"} · MQ-2 is a prototype relative reading, not a CO measurement</CardDescription>
          </div>
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setMetric("gasLevel")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center space-x-1.5 ${
                metric === "gasLevel" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>MQ-2 Level</span>
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
        <div className="h-[min(58vh,34rem)] min-h-[260px] w-full sm:min-h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="timestampMs"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "12px", color: "#f4f4f5" }}
                labelStyle={{ color: "#a1a1aa", fontSize: "12px" }}
                labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
              />
              {config.threshold && (
                <ReferenceLine
                  y={config.threshold}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: `Prototype trigger (${config.threshold} ${config.unit})`, fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                />
              )}
              {data.filter((point) => point.isAnomaly).map((point) => (
                <ReferenceDot
                  key={`${point.eventId ?? "reading"}-${point.timestampMs}`}
                  x={point.timestampMs}
                  y={metric === "temperature" ? point.temperature : point.gasLevel}
                  r={5}
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth={1.5}
                  isFront
                />
              ))}
              <Area type="monotone" dataKey={metric} stroke={config.color} strokeWidth={2.5} fillOpacity={1} fill="url(#metricGradient)" isAnimationActive animationDuration={250} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
