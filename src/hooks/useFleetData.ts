import { useCallback, useEffect, useState } from "react";
import { TelemetryPoint, FleetNode, ActionLogEntry } from "@/types/fleet";

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

export function useFleetData(idToken: string | null) {
  const [selectedNodeId, setSelectedNodeId] = useState("node-01");
  const [nodes, setNodes] = useState<FleetNode[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, TelemetryPoint[]>>({});
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [streamState, setStreamState] = useState<"waiting" | "connecting" | "connected" | "disconnected">("waiting");
  const apiUrl = process.env.NEXT_PUBLIC_FLEET_API_URL?.replace(/\/$/, "");
  const socketUrl = process.env.NEXT_PUBLIC_FLEET_WEBSOCKET_URL;

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
        setNodes((nodeResult.nodes as ApiNode[]).map((node) => ({
          id: node.id,
          name: node.name ?? `ESP32 ${node.id}`,
          status: node.status ?? "offline",
          temperature: node.temperature ?? 0,
          humidity: node.humidity ?? 0,
          gasLevel: node.gasLevel ?? 0,
          actuatorState: node.actuatorState ?? emptyActuatorState,
          lastSeen: node.lastSeen ?? "No telemetry yet",
        })));
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
          const time = new Date(message.timestamp);
          const timestamp = Number.isNaN(time.getTime()) ? message.timestamp : time.toLocaleTimeString();
          const point = {
            timestamp,
            temperature: message.temperature,
            humidity: message.humidity,
            gasLevel: message.gasLevel,
            isAnomaly: message.isAnomaly === true,
          };
          setNodes((previous) => {
            const exists = previous.some((node) => node.id === message.nodeId);
            const updated = previous.map((node) => node.id === message.nodeId ? {
              ...node,
              status: "online" as const,
              temperature: message.temperature,
              humidity: message.humidity,
              gasLevel: message.gasLevel,
              actuatorState: message.actuatorState ?? node.actuatorState,
              lastSeen: "Just now",
            } : node);
            return exists ? updated : [...updated, {
              id: message.nodeId, name: `ESP32 ${message.nodeId}`, status: "online",
              temperature: message.temperature, humidity: message.humidity, gasLevel: message.gasLevel,
              actuatorState: message.actuatorState ?? emptyActuatorState, lastSeen: "Just now",
            }];
          });
          setTelemetryHistory((previous) => ({
            ...previous,
            [message.nodeId]: [...(previous[message.nodeId] ?? []).slice(-49), point],
          }));
          const logEntry: ActionLogEntry = {
            id: `${message.nodeId}-${message.eventId}-${message.timestamp}`,
            timestamp,
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
        const points = (result.data as Array<StreamMessage>).reverse().map((point) => ({
          timestamp: new Date(point.timestamp).toLocaleTimeString(),
          temperature: point.temperature,
          humidity: point.humidity,
          gasLevel: point.gasLevel,
          isAnomaly: point.isAnomaly === true,
        }));
        setTelemetryHistory((previous) => previous[selectedNodeId]?.length ? previous : { ...previous, [selectedNodeId]: points });
      })
      .catch((error) => console.error("Could not load telemetry history", error));
    return () => { cancelled = true; };
  }, [idToken, apiUrl, selectedNodeId, fetchJson]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    nodes,
    selectedNode: nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    activeTelemetry: telemetryHistory[selectedNodeId] ?? [],
    logs,
    streamState,
  };
}
