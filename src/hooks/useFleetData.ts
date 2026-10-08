import { useCallback, useEffect, useState } from "react";
import { TelemetryPoint, FleetNode, ActionLogEntry } from "@/types/fleet";

const TELEMETRY_STALE_AFTER_MS = 90_000;
const ALLOWED_CLOCK_SKEW_MS = 30_000;

type ApiNode = Partial<FleetNode> & { id: string; temperature?: number; humidity?: number; gasLevel?: number };
type StreamMessage = {
  type: "telemetry";
  eventId: string;
  nodeId: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  gasLevel: number;
  isAnomaly?: boolean;
  actuatorState?: FleetNode["actuatorState"];
};

const emptyActuatorState = { relayActive: false, fanActive: false, buzzerActive: false };

function telemetryStatus(lastSeen: string, now: number): FleetNode["status"] {
  const lastSeenMs = Date.parse(lastSeen);
  if (!Number.isFinite(lastSeenMs)) return "offline";
  const ageMs = now - lastSeenMs;
  if (ageMs < -ALLOWED_CLOCK_SKEW_MS) return "degraded";
  return ageMs <= TELEMETRY_STALE_AFTER_MS ? "online" : "offline";
}

function toTelemetryPoint(record: StreamMessage): TelemetryPoint {
  const parsedTimestamp = Date.parse(record.timestamp);
  const timestampMs = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  return {
    eventId: record.eventId,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    temperature: record.temperature,
    humidity: record.humidity,
    gasLevel: record.gasLevel,
    isAnomaly: record.isAnomaly === true,
  };
}

function mergeTelemetryPoints(...groups: TelemetryPoint[][]): TelemetryPoint[] {
  const pointsById = new Map<string, TelemetryPoint>();
  for (const point of groups.flat()) {
    const key = point.eventId ?? `${point.timestampMs}:${point.temperature}:${point.humidity}:${point.gasLevel}`;
    pointsById.set(key, point);
  }
  const merged: TelemetryPoint[] = [];
  pointsById.forEach((point) => merged.push(point));
  return merged.sort((a, b) => a.timestampMs - b.timestampMs).slice(-50);
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
  const [selectedNodeId, setSelectedNodeId] = useState("node-01");
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

  const fetchJson = useCallback(async (path: string) => {
    if (!apiUrl || !idToken) throw new Error("Fleet API or Cognito session is not configured");
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Fleet API returned ${response.status}`);
    return response.json();
  }, [apiUrl, idToken]);

  useEffect(() => {
    if (!idToken || !apiUrl) return;
    let cancelled = false;
    Promise.all([fetchJson("/nodes"), fetchJson("/logs?limit=50")])
      .then(([nodeResult, logResult]) => {
        if (cancelled) return;
        const receivedAt = Date.now();
        setNodes((nodeResult.nodes as ApiNode[]).map((node) => {
          const lastSeen = node.lastSeen ?? "";
          return {
            id: node.id,
            name: node.name ?? `ESP32 ${node.id}`,
            status: telemetryStatus(lastSeen, receivedAt),
            temperature: node.temperature ?? 0,
            humidity: node.humidity ?? 0,
            gasLevel: node.gasLevel ?? 0,
            actuatorState: node.actuatorState ?? emptyActuatorState,
            lastSeen,
          };
        }));
        setLogs((logResult.logs as ActionLogEntry[]).map((log) => ({ ...log, id: log.id ?? `${log.timestamp}-${log.nodeId}` })));
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
          if (message.type !== "telemetry" || !message.nodeId) return;
          const point = toTelemetryPoint(message);
          const receivedAt = new Date().toISOString();
          setNodes((previous) => {
            const exists = previous.some((node) => node.id === message.nodeId);
            const updated = previous.map((node) => node.id === message.nodeId ? {
              ...node,
              status: "online" as const,
              temperature: message.temperature,
              humidity: message.humidity,
              gasLevel: message.gasLevel,
              actuatorState: message.actuatorState ?? node.actuatorState,
              lastSeen: receivedAt,
            } : node);
            return exists ? updated : [...updated, {
              id: message.nodeId, name: `ESP32 ${message.nodeId}`, status: "online",
              temperature: message.temperature, humidity: message.humidity, gasLevel: message.gasLevel,
              actuatorState: message.actuatorState ?? emptyActuatorState, lastSeen: receivedAt,
            }];
          });
          setTelemetryHistory((previous) => ({
            ...previous,
            [message.nodeId]: mergeTelemetryPoints(previous[message.nodeId] ?? [], [point]),
          }));
          const logEntry: ActionLogEntry = {
            id: `${message.nodeId}-${message.eventId}-${message.timestamp}`,
            timestamp: formatTimestamp(message.timestamp),
            nodeId: message.nodeId,
            eventType: message.isAnomaly ? "anomaly_detected" : "telemetry",
            message: message.isAnomaly ? `Anomaly detected: ${message.gasLevel} PPM` : `Live reading received: ${message.gasLevel} PPM gas`,
            source: "AWS IoT Core",
            severity: message.isAnomaly ? "warning" : "info",
          };
          setLogs((previous) => [logEntry, ...previous].slice(0, 50));
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
        const points = (result.data as StreamMessage[]).map(toTelemetryPoint);
        setTelemetryHistory((previous) => ({
          ...previous,
          [selectedNodeId]: mergeTelemetryPoints(points, previous[selectedNodeId] ?? []),
        }));
      })
      .catch((error) => console.error("Could not load telemetry history", error));
    return () => { cancelled = true; };
  }, [idToken, apiUrl, selectedNodeId, fetchJson]);

  const node = nodes.find((item) => item.id === selectedNodeId) ?? nodes[0];
  const selectedNode = node ? { ...node, status: telemetryStatus(node.lastSeen, now) } : undefined;

  return {
    selectedNodeId,
    setSelectedNodeId,
    nodes,
    selectedNode,
    activeTelemetry: telemetryHistory[selectedNodeId] ?? [],
    logs,
    streamState,
    telemetryAge: selectedNode ? formatTelemetryAge(selectedNode.lastSeen, now) : "No telemetry received",
  };
}
