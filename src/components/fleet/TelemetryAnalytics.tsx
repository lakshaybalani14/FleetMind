"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import type { TelemetryPoint } from "@/types/fleet";
import ButtonGroup from "@/components/ui/primitive-button-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AreaChart } from "@/components/ui/area-chart";
import { TelemetryDistributionDonut } from "./TelemetryDistributionDonut";

interface Props {
  data: TelemetryPoint[];
}

export function TelemetryAnalytics({ data }: Props) {
  const hasPlayedEntryAnimation = useRef(false);
  const [animateOnEntry, setAnimateOnEntry] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<"gasLevel" | "temperature">("gasLevel");
  const ordered = [...data].sort((a, b) => a.timestampMs - b.timestampMs);
  const metric = selectedMetric === "gasLevel"
    ? { key: "gasLevel" as const, label: "MQ-2 relative", threshold: 400, domain: [0, 1000] as [number, number], format: (value: number) => `${value.toFixed(0)} / 1000` }
    : { key: "temperature" as const, label: "Temperature", threshold: 60, domain: [0, 70] as [number, number], format: (value: number) => `${value.toFixed(1)} °C` };
  const chartData = ordered.map((point) => ({ timestampMs: point.timestampMs, reading: point[metric.key] }));
  const chartColor = selectedMetric === "gasLevel" ? "#60a5fa" : "#34d399";

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
            <TrendingUp className="h-5 w-5 text-violet-300" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Past trends</CardTitle>
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
                <ButtonGroup aria-label="Sensor metric">
                  {(["gasLevel", "temperature"] as const).map((key) => (
                    <Button key={key} type="button" size="sm" variant={selectedMetric === key ? "default" : "ghost"} onClick={() => setSelectedMetric(key)} aria-pressed={selectedMetric === key}
                      className={cn(selectedMetric === key && (key === "gasLevel" ? "border border-blue-300/20 bg-blue-400/15 text-blue-100 shadow-sm hover:bg-blue-400/20" : "border border-emerald-300/20 bg-emerald-400/15 text-emerald-100 shadow-sm hover:bg-emerald-400/20"))}>
                      {key === "gasLevel" ? "MQ-2" : "Temperature"}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
              <AreaChart
                data={chartData}
                index="timestampMs"
                indexType="number"
                category="reading"
                strokeColor={chartColor}
                fillColor={chartColor}
                valueFormatter={(value) => selectedMetric === "temperature" ? `${value.toFixed(1)} °C` : `${value.toFixed(0)}`}
                indexFormatter={(value) => new Date(Number(value)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                referenceLine={{ value: metric.threshold, label: `Trigger ${metric.threshold}${selectedMetric === "temperature" ? " °C" : ""}`, color: "#f87171" }}
                animate={animateOnEntry}
                className="h-64 w-full"
              />
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
                <span className="flex items-center gap-2"><i className="h-0.5 w-4 bg-blue-400" />{metric.label}</span>
                <span className="flex items-center gap-2"><i className="h-0.5 w-4 border-t border-dashed border-red-400" />Prototype trigger ({metric.threshold}{selectedMetric === "temperature" ? " °C" : ""})</span>
              </div>
            </section>

            <TelemetryDistributionDonut data={ordered} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
