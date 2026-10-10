import type { ActionLogEntry, FleetNode, TelemetryPoint } from "../types/fleet";

const TELEMETRY_STALE_AFTER_MS = 90_000;
const ALLOWED_CLOCK_SKEW_MS = 30_000;
const emptyActuatorState = { relayActive: false, fanActive: false, buzzerActive: false };

export type TelemetryStreamMessage = {
  type: "telemetry";
  eventId: string;
  nodeId: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  gasLevel: number;
  gasAdc?: number;
  isAnomaly?: boolean;
  actuatorState?: FleetNode["actuatorState"];
};

export function telemetryStatusAt(timestampMs: number, nowMs: number): FleetNode["status"] {
  const ageMs = nowMs - timestampMs;
  if (ageMs < -ALLOWED_CLOCK_SKEW_MS) return "degraded";
  return ageMs <= TELEMETRY_STALE_AFTER_MS ? "online" : "offline";
}

export function telemetryMessageToPoint(record: TelemetryStreamMessage): TelemetryPoint | undefined {
  const timestampMs = Date.parse(record.timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    !Number.isFinite(record.temperature) ||
    !Number.isFinite(record.humidity) ||
    !Number.isFinite(record.gasLevel) ||
    (record.gasAdc !== undefined && !Number.isFinite(record.gasAdc))
  ) return undefined;

  return {
    eventId: record.eventId,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    temperature: record.temperature,
    humidity: record.humidity,
    gasLevel: record.gasLevel,
    gasAdc: record.gasAdc,
    isAnomaly: record.isAnomaly === true,
  };
}

export function mergeTelemetryPoints(...groups: TelemetryPoint[][]): TelemetryPoint[] {
  const pointsById = new Map<string, TelemetryPoint>();
  for (const point of groups.flat()) {
    // Sequence numbers can restart after an ESP32 reboot; include time so a new
    // sample with the same sequence does not replace a different historical one.
    const key = point.eventId
      ? `${point.eventId}:${point.timestampMs}`
      : `${point.timestampMs}:${point.temperature}:${point.humidity}:${point.gasLevel}`;
    pointsById.set(key, point);
  }
  const merged: TelemetryPoint[] = [];
  pointsById.forEach((point) => merged.push(point));
  return merged.sort((a, b) => a.timestampMs - b.timestampMs).slice(-50);
}

export function applyTelemetryToNodes(
  nodes: FleetNode[],
  message: TelemetryStreamMessage,
  nowMs = Date.now(),
): FleetNode[] {
  const point = telemetryMessageToPoint(message);
  if (!point) return nodes;

  const current = nodes.find((node) => node.id === message.nodeId);
  const currentTimestampMs = current ? Date.parse(current.lastSeen) : Number.NaN;
  // A delayed frame may still be useful in chart history, but it must not
  // overwrite the current-value tiles or make an old reading look live.
  if (current && Number.isFinite(currentTimestampMs) && point.timestampMs < currentTimestampMs) return nodes;

  const status = telemetryStatusAt(point.timestampMs, nowMs);
  const updated: FleetNode = {
    id: message.nodeId,
    name: current?.name ?? `ESP32 ${message.nodeId}`,
    status,
    temperature: message.temperature,
    humidity: message.humidity,
    gasLevel: message.gasLevel,
    gasAdc: message.gasAdc,
    actuatorState: message.actuatorState ?? current?.actuatorState ?? emptyActuatorState,
    actuatorStateStale: status !== "online",
    automationEnabled: current?.automationEnabled,
    lastActuatorActionId: current?.lastActuatorActionId,
    lastActuatorActionResult: current?.lastActuatorActionResult,
    lastSeen: point.timestamp,
  };

  return current
    ? nodes.map((node) => node.id === message.nodeId ? updated : node)
    : [...nodes, updated];
}

export function mergeNodeSnapshot(currentNodes: FleetNode[], snapshotNodes: FleetNode[]): FleetNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const snapshotIds = new Set(snapshotNodes.map((node) => node.id));
  const merged = snapshotNodes.map((snapshot) => {
    const current = currentById.get(snapshot.id);
    if (!current) return snapshot;
    const currentTime = Date.parse(current.lastSeen);
    const snapshotTime = Date.parse(snapshot.lastSeen);
    // Initial HTTP requests can finish after WebSocket frames. Keep the live
    // version when its source timestamp is equal or newer than the snapshot.
    return Number.isFinite(currentTime) && (!Number.isFinite(snapshotTime) || currentTime >= snapshotTime)
      ? current
      : snapshot;
  });
  return [...merged, ...currentNodes.filter((node) => !snapshotIds.has(node.id))];
}

export function mergeActionLogs(...groups: ActionLogEntry[][]): ActionLogEntry[] {
  const seen = new Set<string>();
  const merged: ActionLogEntry[] = [];
  for (const entry of groups.flat()) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
    if (merged.length === 50) break;
  }
  return merged;
}
