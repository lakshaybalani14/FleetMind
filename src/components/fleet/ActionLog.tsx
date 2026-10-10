import React, { useState } from "react";
import { ActionLogEntry } from "@/types/fleet";
import { Cpu, Cloud, BrainCircuit, Zap } from "lucide-react";

interface Props {
  logs: ActionLogEntry[];
}

export function ActionLog({ logs }: Props) {
  const [filter, setFilter] = useState<"all" | "alerts" | "relay">("all");
  const visibleLogs = logs.filter((log) => {
    if (filter === "alerts") return log.eventType === "anomaly_detected" || log.severity !== "info";
    if (filter === "relay") return log.eventType === "actuator_command";
    return true;
  });
  const getIcon = (source: ActionLogEntry["source"]) => {
    switch (source) {
      case "ESP32 FreeRTOS": return <Cpu className="w-4 h-4 text-emerald-400" />;
      case "AWS IoT Core": return <Cloud className="w-4 h-4 text-blue-400" />;
      case "AWS Lambda ML": return <BrainCircuit className="w-4 h-4 text-purple-400" />;
      default: return <Zap className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-4">
        <div className="mb-3 flex gap-2" role="group" aria-label="Filter activity log">
          {(["all", "alerts", "relay"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition ${filter === value ? "border-blue-400/40 bg-blue-400/10 text-blue-200" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"}`}
            >{value === "relay" ? "Relay" : value === "alerts" ? "Alerts" : "All"}</button>
          ))}
          {filter === "alerts" && <span className="self-center text-[11px] text-zinc-500">Threshold flags are prototype/demo indicators.</span>}
        </div>
        <div className="space-y-3 pr-1" aria-live="polite" aria-relevant="additions text">
          {visibleLogs.length === 0 ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500">No {filter === "all" ? "activity" : filter} events yet.</p>
          ) : visibleLogs.map((log) => (
            <div
              key={log.id}
              className={`p-3.5 rounded-xl border transition-all text-xs ${
                log.severity === "critical"
                  ? "bg-red-500/10 border-red-500/30 text-red-200"
                  : log.severity === "warning"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                  : "bg-zinc-900/60 border-zinc-800/80 text-zinc-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2">
                  {getIcon(log.source)}
                  <span className="font-semibold">{log.source}</span>
                </div>
                <span className="text-[10px] text-zinc-500">{log.timestamp}</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">{log.message}</p>
            </div>
          ))}
        </div>
    </div>
  );
}
