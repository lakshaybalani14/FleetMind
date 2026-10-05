import React from "react";
import { ActionLogEntry } from "@/types/fleet";
import { Cpu, Cloud, BrainCircuit, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

interface Props {
  logs: ActionLogEntry[];
}

export function ActionLog({ logs }: Props) {
  const getIcon = (source: ActionLogEntry["source"]) => {
    switch (source) {
      case "ESP32 FreeRTOS": return <Cpu className="w-4 h-4 text-emerald-400" />;
      case "AWS IoT Core": return <Cloud className="w-4 h-4 text-blue-400" />;
      case "AWS Lambda ML": return <BrainCircuit className="w-4 h-4 text-purple-400" />;
      default: return <Zap className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Closed-Loop Action Trace</CardTitle>
        <CardDescription>Sensor → AWS IoT → Lambda ML → Actuator</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[380px]">
          {logs.map((log) => (
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
      </CardContent>
    </Card>
  );
}
