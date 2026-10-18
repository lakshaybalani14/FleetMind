"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFleetData } from "@/hooks/useFleetData";
import { TelemetryChart } from "./TelemetryChart";
import { MonitoringBento } from "./MonitoringBento";
import { NodeSelector } from "./NodeSelector";
import { FleetPageNavigation } from "./FleetPageNavigation";
import { AlertTriangle, BellRing, Cpu, ShieldCheck } from "lucide-react";
import { beginCognitoLogin, clearCognitoSession, cognitoLogoutUrl, getCognitoIdToken } from "@/lib/cognito";
import { HazardAlertOverlay } from "./HazardAlertOverlay";
import { MonitorDrawer } from "./MonitorDrawer";
import { dashboardAlertForNode, type DashboardAlert } from "@/lib/telemetry-analysis";
import SquishSwitch from "@/components/ui/SquishSwitch";
import { toast, ToastViewport } from "@/components/ui/toast";

export default function FleetDashboard() {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [controlBusy, setControlBusy] = useState(false);
  const [pendingActionId, setPendingActionId] = useState("");
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<Record<string, DashboardAlert>>({});
  const [monitorDrawerOpen, setMonitorDrawerOpen] = useState(false);
  const { selectedNodeId, setSelectedNodeId, nodes, selectedNode, activeTelemetry, logs, streamState, telemetryAge, sendRelayCommand, setAutomationEnabled, setMonitoringEnabled } = useFleetData(idToken);
  const activeAlerts = useMemo(() => nodes.flatMap((node) => {
    const alert = dashboardAlertForNode(node);
    return alert ? [alert] : [];
  }), [nodes]);
  const activeAlertKeys = useMemo(() => activeAlerts.map((alert) => alert.key).join("|"), [activeAlerts]);
  const pendingAlertList = Object.values(pendingAlerts);
  const visibleAlert = pendingAlertList.find((alert) => !dismissedAlertKeys.includes(alert.key));
  const closeMonitorDrawer = useCallback(() => setMonitorDrawerOpen(false), []);

  useEffect(() => {
    const activeKeys = new Set(activeAlertKeys ? activeAlertKeys.split("|") : []);
    setDismissedAlertKeys((previous) => {
      const next = previous.filter((key) => activeKeys.has(key));
      return next.length === previous.length ? previous : next;
    });
    if (activeAlerts.length > 0) {
      setPendingAlerts((previous) => {
        let changed = false;
        const next = { ...previous };
        for (const alert of activeAlerts) {
          if (dismissedAlertKeys.includes(alert.key) || next[alert.key]) continue;
          next[alert.key] = alert;
          changed = true;
        }
        return changed ? next : previous;
      });
    }
  }, [activeAlertKeys, activeAlerts, dismissedAlertKeys]);

  useEffect(() => {
    setIdToken(getCognitoIdToken());
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (pendingActionId && selectedNode?.lastActuatorActionId === pendingActionId) {
      setPendingActionId("");
      const applied = selectedNode.lastActuatorActionResult === "applied";
      toast.add({
        title: applied ? "Relay change confirmed" : "Relay command needs attention",
        description: applied ? "The device confirmed the new relay state." : `Device reported: ${selectedNode.lastActuatorActionResult ?? "command failed"}.`,
      });
    }
  }, [pendingActionId, selectedNode?.lastActuatorActionId, selectedNode?.lastActuatorActionResult]);

  useEffect(() => {
    if (!pendingActionId) return;
    const timeout = setTimeout(() => {
      setPendingActionId("");
      toast.add({ title: "No device confirmation", description: "No acknowledgement arrived in 15 seconds. Check the node connection and IoT acknowledgement rule." });
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
          <p className="mt-2 text-sm text-zinc-400">Sign in securely with Amazon Cognito to view live fleet data.</p>
          <button onClick={() => void beginCognitoLogin().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Sign-in could not start."))}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Sign in securely
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
    try {
      const result = await setAutomationEnabled(!selectedNode.automationEnabled);
      toast.add({ title: result.controlMode === "automatic" ? "Automatic mode enabled" : "Manual mode enabled", description: "Control settings were updated for this device." });
    } catch (error) {
      toast.add({ title: "Could not update control mode", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setControlBusy(false);
    }
  };

  const toggleRelay = async () => {
    if (!selectedNode) return;
    setControlBusy(true);
    try {
      const result = await sendRelayCommand(!selectedNode.actuatorState.relayActive);
      setPendingActionId(result.actionId);
      toast.add({ title: "Relay command sent", description: "Waiting for the device to confirm the relay state." });
    } catch (error) {
      toast.add({ title: "Could not send relay command", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setControlBusy(false);
    }
  };

  const toggleHealthMonitoring = async () => {
    if (!selectedNode) return;
    setControlBusy(true);
    try {
      await setMonitoringEnabled(!selectedNode.monitoringEnabled);
      toast.add({ title: selectedNode.monitoringEnabled ? "Device notifications disabled" : "Device notifications enabled", description: "The health notification setting was updated." });
    } catch (error) {
      toast.add({ title: "Could not update notifications", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setControlBusy(false);
    }
  };

  return (
    <FleetPageNavigation current="monitoring" streamState={streamState} onSignOut={signOut}>
    <main className="min-h-screen bg-[#09090b] p-4 font-sans text-zinc-200 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3" role="group" aria-label="Monitoring controls">
        <NodeSelector compact nodes={nodes} selectedNodeId={selectedNodeId} onChange={setSelectedNodeId} />
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] py-1 pl-2.5 pr-1.5" title="Device health notifications">
            <BellRing className={`h-3.5 w-3.5 ${selectedNode?.monitoringEnabled ? "text-blue-200" : "text-zinc-500"}`} aria-hidden="true" />
            <span className="hidden text-[10px] text-zinc-400 sm:inline">SNS</span>
            <SquishSwitch
              label="Enable device health notifications"
              checked={selectedNode?.monitoringEnabled ?? false}
              onChange={() => void toggleHealthMonitoring()}
              disabled={!selectedNode || controlBusy}
              width={48}
              height={26}
              radius={13}
              speed={35}
              stretch={12}
              colorDuration={260}
              trackColor="#3f3f46"
              trackOnColor="#bfdbfe"
              thumbColor="#a1a1aa"
              thumbOnColor="#1e3a8a"
              className="border-white/10"
            />
          </div>
          <button
            type="button"
            onClick={() => setMonitorDrawerOpen(true)}
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center text-amber-300 transition hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            aria-haspopup="dialog"
            aria-expanded={monitorDrawerOpen}
            aria-label={`Open alerts and activity${pendingAlertList.length ? `, ${pendingAlertList.length} pending alerts` : ""}`}
            title="Alerts & activity"
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            {pendingAlertList.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">{pendingAlertList.length}</span>}
          </button>
        </div>
      </div>

      {!selectedNode ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400">
          Waiting for a node to publish valid telemetry to AWS IoT Core…
        </div>
      ) : <>

      <div className="mb-8">
        <MonitoringBento
          node={selectedNode}
          telemetry={activeTelemetry}
          telemetryAge={telemetryAge}
          automationEnabled={Boolean(selectedNode.automationEnabled)}
          relayPending={Boolean(pendingActionId)}
          controlsDisabled={controlBusy}
          onToggleAutomation={() => void toggleAutomation()}
          onToggleRelay={() => void toggleRelay()}
        />
      </div>

      <ToastViewport />

      <TelemetryChart
        data={activeTelemetry}
        nodeName={selectedNode.name}
        isLive={streamState === "connected" && selectedNode.status === "online"}
      />
      </>}
      <MonitorDrawer open={monitorDrawerOpen} activeAlerts={pendingAlertList} logs={logs} onClose={closeMonitorDrawer} />
      {visibleAlert && (
        <HazardAlertOverlay
          alert={visibleAlert}
          otherActiveAlerts={pendingAlertList.length - 1}
          onAcknowledge={() => {
            setPendingAlerts((previous) => {
              const next = { ...previous };
              delete next[visibleAlert.key];
              return next;
            });
            if (activeAlerts.some((alert) => alert.key === visibleAlert.key)) {
              setDismissedAlertKeys((previous) => previous.includes(visibleAlert.key) ? previous : [...previous, visibleAlert.key]);
            }
          }}
        />
      )}
    </main>
    </FleetPageNavigation>
  );
}
