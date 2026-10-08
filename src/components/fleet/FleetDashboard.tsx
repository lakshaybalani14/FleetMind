"use client";

import React, { useEffect, useState } from "react";
import { useFleetData } from "@/hooks/useFleetData";
import { TelemetryChart } from "./TelemetryChart";
import { ActionLog } from "./ActionLog";
import { StatusTile } from "./StatusTile";
import { NodeSelector } from "./NodeSelector";
import { Cpu } from "lucide-react";
import { beginCognitoLogin, clearCognitoSession, cognitoLogoutUrl, getCognitoIdToken } from "@/lib/cognito";

export default function FleetDashboard() {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const { selectedNodeId, setSelectedNodeId, nodes, selectedNode, activeTelemetry, logs, streamState, telemetryAge } = useFleetData(idToken);

  useEffect(() => {
    setIdToken(getCognitoIdToken());
    setAuthReady(true);
  }, []);

  if (!authReady) return <main className="min-h-screen bg-[#09090b] p-8 text-zinc-300">Loading FleetMind…</main>;
  if (!idToken) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] p-8 text-zinc-200">
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <Cpu className="mx-auto mb-4 h-8 w-8 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">FleetMind Platform</h1>
          <p className="mt-2 text-sm text-zinc-400">Sign in with your Cognito dashboard account to view live fleet data.</p>
          <button onClick={() => void beginCognitoLogin().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Sign-in could not start."))}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            Sign in
          </button>
          {authError && <p className="mt-4 text-sm text-red-400">{authError}</p>}
        </div>
      </main>
    );
  }

  const signOut = () => {
    clearCognitoSession();
    window.location.assign(cognitoLogoutUrl());
  };

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
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs ${streamState === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>
            Live stream: {streamState}
          </span>
          <NodeSelector nodes={nodes} selectedNodeId={selectedNodeId} onChange={setSelectedNodeId} />
          <button onClick={signOut} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Sign out</button>
        </div>
      </header>

      {!selectedNode ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400">
          Waiting for a node to publish valid telemetry to AWS IoT Core…
        </div>
      ) : <>

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
          title="Device Telemetry"
          value={selectedNode.status.toUpperCase()}
          subText={telemetryAge}
          status={selectedNode.status === "online" ? "success" : selectedNode.status === "degraded" ? "warning" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TelemetryChart
            data={activeTelemetry}
            nodeName={selectedNode.name}
            isLive={streamState === "connected" && selectedNode.status === "online"}
          />
        </div>
        <div className="lg:col-span-1">
          <ActionLog logs={logs} />
        </div>
      </div>
      </>}
    </div>
  );
}
