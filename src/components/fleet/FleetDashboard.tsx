"use client";

import React from "react";
import { useFleetData } from "@/hooks/useFleetData";
import { TelemetryChart } from "./TelemetryChart";
import { ActionLog } from "./ActionLog";
import { StatusTile } from "./StatusTile";
import { NodeSelector } from "./NodeSelector";
import { Cpu } from "lucide-react";

export default function FleetDashboard() {
  const { selectedNodeId, setSelectedNodeId, nodes, selectedNode, activeTelemetry, logs } = useFleetData();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 p-4 sm:p-8 font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-zinc-800/80 pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Cpu className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">FleetMind Platform</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1">AWS IoT Fleet Telemetry & Edge Automation Control</p>
        </div>
        <NodeSelector nodes={nodes} selectedNodeId={selectedNodeId} onChange={setSelectedNodeId} />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatusTile
          title="Gas / Smoke Level"
          value={`${selectedNode.gasLevel} PPM`}
          subText={selectedNode.gasLevel > 500 ? "Anomaly Triggered" : "Nominal Range"}
          status={selectedNode.gasLevel > 500 ? "danger" : "success"}
        />
        <StatusTile
          title="Ambient Temp"
          value={`${selectedNode.temperature} °C`}
          subText={`Humidity: ${selectedNode.humidity}%`}
          status="neutral"
        />
        <StatusTile
          title="Actuator State"
          value={selectedNode.actuatorState.relayActive ? "Relay Active" : "Relay Idle"}
          subText={selectedNode.actuatorState.fanActive ? "Exhaust Fan Running" : "Standby Mode"}
          status={selectedNode.actuatorState.relayActive ? "warning" : "neutral"}
        />
        <StatusTile
          title="Node Connectivity"
          value={selectedNode.status.toUpperCase()}
          subText={`AWS MQTT connected`}
          status="success"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TelemetryChart data={activeTelemetry} nodeName={selectedNode.name} />
        </div>
        <div className="lg:col-span-1">
          <ActionLog logs={logs} />
        </div>
      </div>
    </div>
  );
}
