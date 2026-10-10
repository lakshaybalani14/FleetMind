"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { demoThresholdReasons } from "@/lib/telemetry-analysis";
import type { TelemetryPoint } from "@/types/fleet";

interface Props {
  data: TelemetryPoint[];
}

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "12px",
  color: "#f4f4f5",
  fontSize: "12px",
};

export function TelemetryAnalytics({ data }: Props) {
  const hasPlayedEntryAnimation = useRef(false);
  const [animateOnEntry, setAnimateOnEntry] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<"gasLevel" | "temperature">("gasLevel");
  const ordered = [...data].sort((a, b) => a.timestampMs - b.timestampMs);
  const metric = selectedMetric === "gasLevel"
    ? { key: "gasLevel" as const, label: "MQ-2 relative", threshold: 400, domain: [0, 1000] as [number, number], format: (value: number) => `${value.toFixed(0)} / 1000` }
    : { key: "temperature" as const, label: "Temperature", threshold: 60, domain: [0, 70] as [number, number], format: (value: number) => `${value.toFixed(1)} °C` };
  const flaggedCount = ordered.filter((point) => point.isAnomaly || demoThresholdReasons(point).length > 0).length;
  const normalCount = ordered.length - flaggedCount;
  const pieData = [
    { name: "Normal", value: normalCount, color: "#34d399" },
    { name: "Alert", value: flaggedCount, color: "#f87171" },
  ].filter((entry) => entry.value > 0);

  useEffect(() => {
    if (ordered.length === 0 || hasPlayedEntryAnimation.current) return;
    hasPlayedEntryAnimation.current = true;
    setAnimateOnEntry(true);
  }, [ordered.length]);

  useEffect(() => {
    if (!animateOnEntry) return;
    const timeout = window.setTimeout(() => setAnimateOnEntry(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [animateOnEntry]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-violet-400/20 bg-violet-400/10 p-2">
            <Activity className="h-5 w-5 text-violet-300" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Telemetry analytics</CardTitle>
            <CardDescription>Visual analysis of the selected node’s latest {ordered.length} readings</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-400">
            Charts will appear after this node sends telemetry.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 xl:col-span-2" aria-label="Sensor trends over time">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">{metric.label} trend</h4>
                  <p className="mt-1 text-xs text-zinc-500">Hover the line to inspect a reading and timestamp.</p>
                </div>
                <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1" role="group" aria-label="Sensor metric">
                  {(["gasLevel", "temperature"] as const).map((key) => (
                    <button key={key} type="button" onClick={() => setSelectedMetric(key)} aria-pressed={selectedMetric === key}
                      className={`rounded-md px-3 py-1.5 text-xs transition-colors ${selectedMetric === key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                      {key === "gasLevel" ? "MQ-2" : "Temperature"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ordered} margin={{ top: 8, right: 4, bottom: 2, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="timestampMs"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      stroke="#71717a"
                      fontSize={10}
                      minTickGap={24}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis domain={metric.domain} stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
                      labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                      formatter={(value) => [metric.format(Number(value)), metric.label]}
                    />
                    <ReferenceLine y={metric.threshold} stroke="#f87171" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey={metric.key} name={metric.label} stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#60a5fa" }} connectNulls isAnimationActive={animateOnEntry} animationBegin={0} animationDuration={1400} animationEasing="ease-in-out" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
                <span className="flex items-center gap-2"><i className="h-0.5 w-4 bg-blue-400" />{metric.label}</span>
                <span className="flex items-center gap-2"><i className="h-0.5 w-4 border-t border-dashed border-red-400" />Prototype trigger ({metric.threshold}{selectedMetric === "temperature" ? " °C" : ""})</span>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4" aria-label="Normal and flagged reading distribution">
              <div className="mb-2">
                <h4 className="text-sm font-semibold text-zinc-100">Reading distribution</h4>
                <p className="mt-1 text-xs text-zinc-500">Normal vs. flagged in this recent window.</p>
              </div>
              <div className="relative h-56 w-full [&_.recharts-pie-label-text]:fill-zinc-100">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={0}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="#111113"
                      strokeWidth={2}
                      label={({ name, value }) => `${name} ${value}`}
                      labelLine={false}
                      isAnimationActive={animateOnEntry}
                      animationBegin={0}
                      animationDuration={1300}
                      animationEasing="ease-out"
                    >
                      {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value} readings`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-xs text-zinc-400">Normal</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">{normalCount}</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <p className="flex items-center gap-1 text-xs text-zinc-400"><AlertTriangle className="h-3 w-3 text-red-300" aria-hidden="true" />Flagged</p>
                  <p className="mt-1 text-lg font-semibold text-red-300">{flaggedCount}</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">Flagged means a firmware anomaly flag or a prototype threshold crossing—not a trained-model diagnosis.</p>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
