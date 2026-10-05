import { FleetNode, TelemetryPoint, ActionLogEntry } from "@/types/fleet";

export const INITIAL_NODES: FleetNode[] = [
  {
    id: "node-01",
    name: "ESP32 Node 01 (Zone A)",
    status: "online",
    temperature: 24.2,
    humidity: 48.5,
    gasLevel: 310,
    actuatorState: { relayActive: false, fanActive: false, buzzerActive: false },
    lastSeen: "Just now",
  },
  {
    id: "node-02",
    name: "ESP32 Node 02 (Zone B)",
    status: "online",
    temperature: 25.8,
    humidity: 52.1,
    gasLevel: 295,
    actuatorState: { relayActive: false, fanActive: false, buzzerActive: false },
    lastSeen: "Just now",
  },
];

export function generateInitialTelemetry(nodeId: string): TelemetryPoint[] {
  const baseTemp = nodeId === "node-01" ? 23.5 : 25.0;
  const baseHumidity = nodeId === "node-01" ? 45 : 50;
  const baseGas = nodeId === "node-01" ? 300 : 280;
  return Array.from({ length: 15 }, (_, i) => ({
    timestamp: new Date(Date.now() - (15 - i) * 3000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    temperature: baseTemp + Math.random() * 1.5,
    humidity: baseHumidity + Math.random() * 5,
    gasLevel: baseGas + Math.random() * 30,
    isAnomaly: false,
  }));
}

export const INITIAL_LOGS: ActionLogEntry[] = [
  {
    id: "log-1",
    timestamp: new Date().toLocaleTimeString(),
    nodeId: "node-01",
    eventType: "telemetry",
    message: "MQTT payload received: DHT22 & MQ-2 state published",
    source: "AWS IoT Core",
    severity: "info",
  },
];
