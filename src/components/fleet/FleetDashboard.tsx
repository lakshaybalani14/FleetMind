"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useFleetData } from "@/hooks/useFleetData";
import { TelemetryChart } from "./TelemetryChart";
import { MonitoringBento } from "./MonitoringBento";
import { NodeSelector } from "./NodeSelector";
import { FleetPageNavigation } from "./FleetPageNavigation";
import { Activity, Cpu } from "lucide-react";
import { beginCognitoLogin, clearCognitoSession, cognitoLogoutUrl, getCognitoIdToken } from "@/lib/cognito";
import { HazardAlertOverlay } from "./HazardAlertOverlay";
import { MonitorDrawer } from "./MonitorDrawer";
import { dashboardAlertForNode } from "@/lib/telemetry-analysis";

export default function FleetDashboard() {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [controlBusy, setControlBusy] = useState(false);
  const [pendingActionId, setPendingActionId] = useState("");
  const [controlMessage, setControlMessage] = useState("");
  const [controlError, setControlError] = useState("");
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>([]);
  const [monitorDrawerOpen, setMonitorDrawerOpen] = useState(false);
  const { selectedNodeId, setSelectedNodeId, nodes, selectedNode, activeTelemetry, logs, streamState, telemetryAge, sendRelayCommand, setAutomationEnabled } = useFleetData(idToken);
  const activeAlerts = nodes.flatMap((node) => {
    const alert = dashboardAlertForNode(node);
    return alert ? [alert] : [];
  });
  const activeAlertKeys = activeAlerts.map((alert) => alert.key).join("|");
  const visibleAlert = activeAlerts.find((alert) => !dismissedAlertKeys.includes(alert.key));
  const closeMonitorDrawer = useCallback(() => setMonitorDrawerOpen(false), []);

  useEffect(() => {
    const activeKeys = new Set(activeAlertKeys ? activeAlertKeys.split("|") : []);
    setDismissedAlertKeys((previous) => {
      const next = previous.filter((key) => activeKeys.has(key));
      return next.length === previous.length ? previous : next;
    });
  }, [activeAlertKeys]);

  useEffect(() => {
    setIdToken(getCognitoIdToken());
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (pendingActionId && selectedNode?.lastActuatorActionId === pendingActionId) {
      setPendingActionId("");
      setControlMessage(selectedNode.lastActuatorActionResult === "applied"
        ? "Device confirmed the relay change."
        : `Device reported: ${selectedNode.lastActuatorActionResult ?? "command failed"}.`);
    }
  }, [pendingActionId, selectedNode?.lastActuatorActionId, selectedNode?.lastActuatorActionResult]);

  useEffect(() => {
    if (!pendingActionId) return;
    const timeout = setTimeout(() => {
      setPendingActionId("");
      setControlError("No device acknowledgement in 15 seconds. Check the node connection and IoT acknowledgement rule.");
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [pendingActionId]);

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

  const toggleAutomation = async () => {
    if (!selectedNode) return;
    setControlBusy(true);
    setControlError("");
    setControlMessage("");
    try {
      const result = await setAutomationEnabled(!selectedNode.automationEnabled);
      setControlMessage(result.controlMode === "automatic" ? "Automatic threshold control enabled." : "Manual control selected.");
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Could not change control mode.");
    } finally {
      setControlBusy(false);
    }
  };

  const toggleRelay = async () => {
    if (!selectedNode) return;
    setControlBusy(true);
    setControlError("");
    setControlMessage("");
    try {
      const result = await sendRelayCommand(!selectedNode.actuatorState.relayActive);
      setPendingActionId(result.actionId);
      setControlMessage("Command sent. Waiting for the device to confirm the relay state.");
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Could not send relay command.");
    } finally {
      setControlBusy(false);
    }
  };

  return (
    <FleetPageNavigation current="monitoring" streamState={streamState} onSignOut={signOut}>
    <main className="min-h-screen bg-[#09090b] p-4 font-sans text-zinc-200 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3" role="group" aria-label="Monitoring controls">
        <NodeSelector compact nodes={nodes} selectedNodeId={selectedNodeId} onChange={setSelectedNodeId} />
        <button
          type="button"
          onClick={() => setMonitorDrawerOpen(true)}
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-haspopup="dialog"
          aria-expanded={monitorDrawerOpen}
          aria-label={`Open alerts and activity${activeAlerts.length ? `, ${activeAlerts.length} active alerts` : ""}`}
          title="Alerts & activity"
        >
          <Activity className="h-5 w-5" aria-hidden="true" />
          {activeAlerts.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">{activeAlerts.length}</span>}
        </button>
      </div>

      {!selectedNode ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400">
          Waiting for a node to publish valid telemetry to AWS IoT Core…
        </div>
      ) : <>

      <div className="mb-8">
        <MonitoringBento node={selectedNode} telemetry={activeTelemetry} telemetryAge={telemetryAge} />
      </div>

      <section className="mb-8 flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Fan control</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Mode: {selectedNode.automationEnabled ? "Automatic demo" : "Manual"}. Automatic demo uses prototype sensor thresholds; MQ-2 is not a CO alarm. A manual relay command switches it to manual.
          </p>
          {controlMessage && <p role="status" className="mt-2 text-xs text-emerald-300">{controlMessage}</p>}
          {controlError && <p role="alert" className="mt-2 text-xs text-red-300">{controlError}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void toggleAutomation()}
            disabled={controlBusy}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedNode.automationEnabled ? "Switch to manual" : "Enable automatic"}
          </button>
          <button
            onClick={() => void toggleRelay()}
            disabled={controlBusy || Boolean(pendingActionId) || selectedNode.status !== "online" || selectedNode.actuatorStateStale}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingActionId ? "Waiting for device…" : selectedNode.actuatorState.relayActive ? "Turn fan off" : "Turn fan on"}
          </button>
        </div>
      </section>

      <TelemetryChart
        data={activeTelemetry}
        nodeName={selectedNode.name}
        isLive={streamState === "connected" && selectedNode.status === "online"}
      />
      </>}
      <MonitorDrawer open={monitorDrawerOpen} activeAlerts={activeAlerts} logs={logs} onClose={closeMonitorDrawer} />
      {visibleAlert && (
        <HazardAlertOverlay
          alert={visibleAlert}
          otherActiveAlerts={activeAlerts.length - 1}
          onAcknowledge={() => setDismissedAlertKeys((previous) => previous.includes(visibleAlert.key) ? previous : [...previous, visibleAlert.key])}
        />
      )}
    </main>
    </FleetPageNavigation>
  );
}
