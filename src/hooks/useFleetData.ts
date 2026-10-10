import { useCallback, useEffect, useState } from "react";
import type { TelemetryPoint, FleetNode, ActionLogEntry } from "@/types/fleet";
import {
  applyTelemetryToNodes,
  mergeActionLogs,
  mergeNodeSnapshot,
  mergeTelemetryPoints,
  resolveSelectedNodeId,
  telemetryMessageToPoint,
  telemetryStatusAt,
  type TelemetryStreamMessage,
} from "@/lib/fleet-stream";
import { demoThresholdReasons } from "@/lib/telemetry-analysis";

const ALLOWED_CLOCK_SKEW_MS = 30_000;

type ApiNode = Partial<FleetNode> & { id: string; temperature?: number; humidity?: number; gasLevel?: number };
type NodeStatusStreamMessage = {
  type: "node-status";
  nodeId: string;
  online: boolean;
  timestamp: string;
  relayOn?: boolean;
  rssi?: number;
  uptimeMs?: number;
  commandQueueOverflow?: boolean;
};
type ControlModeStreamMessage = {
  type: "control-mode";
  nodeId: string;
  automationEnabled: boolean;
  timestamp: string;
};
type ActuatorAckStreamMessage = {
  type: "actuator-ack";
  nodeId: string;
  actionId: string;
  relayOn: boolean;
  result: string;
  timestamp: string;
};
type StreamMessage = TelemetryStreamMessage | NodeStatusStreamMessage | ControlModeStreamMessage | ActuatorAckStreamMessage;

const emptyActuatorState = { relayActive: false, fanActive: false, buzzerActive: false };

function currentNodeStatus(node: FleetNode, now: number): FleetNode["status"] {
  // An explicit Last Will/offline update must win over its fresh receive time.
  if (node.status === "offline") return "offline";
  const freshness = telemetryStatusAt(Date.parse(node.lastSeen), now);
  return freshness === "online" ? node.status : freshness;
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleTimeString() : value;
}

function formatTelemetryAge(value: string, now: number): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "No telemetry received";
  const ageMs = now - parsed;
  if (ageMs < -ALLOWED_CLOCK_SKEW_MS) return "Device clock is ahead";
  if (ageMs < 10_000) return "Last reading just now";
  if (ageMs < 60_000) return `Last reading ${Math.floor(ageMs / 1_000)}s ago`;
  return `Last reading ${Math.floor(ageMs / 60_000)}m ago`;
}

export function useFleetData(idToken: string | null) {
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [nodes, setNodes] = useState<FleetNode[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, TelemetryPoint[]>>({});
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [streamState, setStreamState] = useState<"waiting" | "connecting" | "connected" | "disconnected">("waiting");
  const [now, setNow] = useState(() => Date.now());
  const apiUrl = process.env.NEXT_PUBLIC_FLEET_API_URL?.replace(/\/$/, "");
  const socketUrl = process.env.NEXT_PUBLIC_FLEET_WEBSOCKET_URL;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const resolvedNodeId = resolveSelectedNodeId(nodes, selectedNodeId);
    if (resolvedNodeId !== selectedNodeId) setSelectedNodeId(resolvedNodeId);
  }, [nodes, selectedNodeId]);

  const fetchJson = useCallback(async (path: string, init?: RequestInit) => {
    if (!apiUrl || !idToken) throw new Error("Fleet API or Cognito session is not configured");
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${idToken}`);
    if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
      throw new Error(typeof errorBody?.error === "string" ? errorBody.error : `Fleet API returned ${response.status}`);
    }
    return response.json();
  }, [apiUrl, idToken]);

  useEffect(() => {
    if (!idToken || !apiUrl) return;
    let cancelled = false;
    Promise.all([fetchJson("/nodes"), fetchJson("/logs?limit=50")])
      .then(([nodeResult, logResult]) => {
        if (cancelled) return;
        const receivedAt = Date.now();
        const snapshotNodes = (nodeResult.nodes as ApiNode[]).map((node) => {
          const lastSeen = node.lastSeen ?? "";
          return {
            id: node.id,
            name: node.name ?? `ESP32 ${node.id}`,
            status: node.status ?? telemetryStatusAt(Date.parse(lastSeen), receivedAt),
            temperature: node.temperature ?? 0,
            humidity: node.humidity ?? 0,
            gasLevel: node.gasLevel ?? 0,
            gasAdc: node.gasAdc,
            actuatorState: node.actuatorState ?? emptyActuatorState,
            actuatorStateStale: node.status === "offline",
            automationEnabled: node.automationEnabled === true,
            lastActuatorActionId: node.lastActuatorActionId,
            lastActuatorActionResult: node.lastActuatorActionResult,
            lastSeen,
          };
        });
        setNodes((previous) => mergeNodeSnapshot(previous, snapshotNodes));
        const snapshotLogs = (logResult.logs as ActionLogEntry[]).map((log) => ({ ...log, id: log.id ?? `${log.timestamp}-${log.nodeId}` }));
        setLogs((previous) => mergeActionLogs(previous, snapshotLogs));
      })
      .catch((error) => console.error("Could not load FleetMind data", error));
    return () => { cancelled = true; };
  }, [idToken, apiUrl, fetchJson]);

  useEffect(() => {
    if (!idToken || !apiUrl || !socketUrl) {
      setStreamState("waiting");
      return;
    }
    let stopped = false;
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

    const connect = async () => {
      if (stopped) return;
      setStreamState("connecting");
      try {
        const ticketResponse = await fetch(`${apiUrl}/ws-ticket`, {
          method: "POST",
          headers: { authorization: `Bearer ${idToken}` },
        });
        if (!ticketResponse.ok) throw new Error(`Could not authorize live stream (${ticketResponse.status})`);
        const { ticket } = await ticketResponse.json() as { ticket: string };
        if (stopped) return;
        socket = new WebSocket(`${socketUrl}${socketUrl.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => { retryDelay = 1000; setStreamState("connected"); };
        socket.onmessage = (event) => {
          let message: StreamMessage;
          try { message = JSON.parse(String(event.data)) as StreamMessage; } catch { return; }
          if (!message.nodeId) return;
          if (message.type === "node-status") {
            if (typeof message.online !== "boolean") return;
            const statusTime = Date.parse(message.timestamp);
            const lastSeen = Number.isFinite(statusTime) ? new Date(statusTime).toISOString() : new Date().toISOString();
            const relayState = typeof message.relayOn === "boolean" ? {
              relayActive: message.relayOn,
              fanActive: message.relayOn,
              buzzerActive: false,
            } : undefined;
            setNodes((previous) => {
              const exists = previous.some((node) => node.id === message.nodeId);
              const updated = previous.map((node) => {
                if (node.id !== message.nodeId) return node;
                const previousStatusTime = Date.parse(node.lastSeen);
                if (Number.isFinite(previousStatusTime) && Number.isFinite(statusTime) && statusTime < previousStatusTime) return node;
                return {
                  ...node,
                  status: message.online ? "online" as const : "offline" as const,
                  actuatorState: relayState ?? node.actuatorState,
                  actuatorStateStale: !message.online || (node.actuatorStateStale === true && !relayState),
                  lastSeen,
                };
              });
              if (exists) return updated;
              return [...updated, {
                id: message.nodeId,
                name: `ESP32 ${message.nodeId}`,
                status: message.online ? "online" : "offline",
                temperature: 0,
                humidity: 0,
                gasLevel: 0,
                actuatorState: relayState ?? emptyActuatorState,
                actuatorStateStale: !message.online || !relayState,
                lastSeen,
              }];
            });
            return;
          }
          if (message.type === "control-mode") {
            if (typeof message.automationEnabled !== "boolean") return;
            setNodes((previous) => previous.map((node) => node.id === message.nodeId
              ? { ...node, automationEnabled: message.automationEnabled }
              : node));
            return;
          }
          if (message.type === "actuator-ack") {
            if (typeof message.relayOn !== "boolean" || !message.actionId) return;
            setNodes((previous) => previous.map((node) => node.id === message.nodeId ? {
              ...node,
              actuatorState: { relayActive: message.relayOn, fanActive: message.relayOn, buzzerActive: false },
              actuatorStateStale: false,
              lastActuatorActionId: message.actionId,
              lastActuatorActionResult: message.result,
            } : node));
            const ackLog: ActionLogEntry = {
              id: message.actionId,
              timestamp: formatTimestamp(message.timestamp),
              nodeId: message.nodeId,
              eventType: "actuator_command",
              message: `Relay ${message.relayOn ? "on" : "off"}: ${message.result}`,
              source: "AWS IoT Core",
              severity: message.result === "applied" ? "info" : "warning",
            };
            setLogs((previous) => mergeActionLogs([ackLog], previous));
            return;
          }
          if (message.type !== "telemetry") return;
          const point = telemetryMessageToPoint(message);
          if (!point) return;
          const thresholdReasons = demoThresholdReasons(message);
          const hasAlert = message.isAnomaly === true || thresholdReasons.length > 0;
          setNodes((previous) => applyTelemetryToNodes(previous, message));
          setTelemetryHistory((previous) => ({
            ...previous,
            [message.nodeId]: mergeTelemetryPoints(previous[message.nodeId] ?? [], [point]),
          }));
          const logEntry: ActionLogEntry = {
            id: `${message.nodeId}-${message.eventId}-${message.timestamp}`,
            timestamp: formatTimestamp(message.timestamp),
            nodeId: message.nodeId,
            eventType: hasAlert ? "anomaly_detected" : "telemetry",
            message: [
              hasAlert ? "PROTOTYPE ALERT" : "Telemetry",
              `MQ-2 relative level ${Math.round(message.gasLevel)}/1000`,
              `temperature ${message.temperature.toFixed(1)} °C`,
              `humidity ${message.humidity.toFixed(1)}%`,
              ...(typeof message.gasAdc === "number" ? [`raw ADC ${message.gasAdc}/4095`] : []),
              ...thresholdReasons,
              ...(message.isAnomaly && thresholdReasons.length === 0 ? ["firmware anomaly flag set"] : []),
            ].join(" · "),
            source: "AWS IoT Core",
            severity: hasAlert ? "critical" : "info",
          };
          setLogs((previous) => mergeActionLogs([logEntry], previous));
        };
        socket.onclose = () => {
          if (stopped) return;
          setStreamState("disconnected");
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        };
        socket.onerror = () => socket?.close();
      } catch (error) {
        console.error("WebSocket connection failed", error);
        setStreamState("disconnected");
        if (!stopped) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      }
    };
    void connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [idToken, apiUrl, socketUrl]);

  useEffect(() => {
    if (!idToken || !apiUrl || !selectedNodeId) return;
    let cancelled = false;
    fetchJson(`/telemetry?nodeId=${encodeURIComponent(selectedNodeId)}&limit=50`)
      .then((result) => {
        if (cancelled) return;
        const points = (result.data as TelemetryStreamMessage[])
          .map(telemetryMessageToPoint)
          .filter((point): point is TelemetryPoint => point !== undefined);
        setTelemetryHistory((previous) => ({
          ...previous,
          [selectedNodeId]: mergeTelemetryPoints(points, previous[selectedNodeId] ?? []),
        }));
      })
      .catch((error) => console.error("Could not load telemetry history", error));
    return () => { cancelled = true; };
  }, [idToken, apiUrl, selectedNodeId, fetchJson]);

  const sendRelayCommand = useCallback(async (relayOn: boolean) => {
    return fetchJson(`/nodes/${encodeURIComponent(selectedNodeId)}/relay`, {
      method: "POST",
      body: JSON.stringify({ relayOn }),
    }) as Promise<{ actionId: string; awaitingDeviceAck: boolean }>;
  }, [fetchJson, selectedNodeId]);

  const setAutomationEnabled = useCallback(async (enabled: boolean) => {
    return fetchJson(`/nodes/${encodeURIComponent(selectedNodeId)}/automation`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }) as Promise<{ automationEnabled: boolean; controlMode: "manual" | "automatic" }>;
  }, [fetchJson, selectedNodeId]);

  const currentNodes = nodes.map((item) => ({ ...item, status: currentNodeStatus(item, now) }));
  const node = currentNodes.find((item) => item.id === selectedNodeId);
  const status = node ? currentNodeStatus(node, now) : undefined;
  const selectedNode = node && status ? {
    ...node,
    status,
    actuatorStateStale: node.actuatorStateStale === true || status !== "online",
  } : undefined;

  return {
    selectedNodeId,
    setSelectedNodeId,
    nodes: currentNodes,
    selectedNode,
    activeTelemetry: telemetryHistory[selectedNodeId] ?? [],
    logs,
    streamState,
    sendRelayCommand,
    setAutomationEnabled,
    telemetryAge: selectedNode ? formatTelemetryAge(selectedNode.lastSeen, now) : "No telemetry received",
  };
}
