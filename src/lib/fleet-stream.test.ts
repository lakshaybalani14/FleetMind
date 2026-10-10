import assert from "node:assert/strict";
import test from "node:test";
import type { ActionLogEntry, FleetNode, TelemetryPoint } from "../types/fleet";
import {
  applyTelemetryToNodes,
  mergeActionLogs,
  mergeNodeSnapshot,
  mergeTelemetryPoints,
  telemetryMessageToPoint,
  type TelemetryStreamMessage,
} from "./fleet-stream";

const now = Date.parse("2026-10-10T09:30:00.000Z");
const currentNode: FleetNode = {
  id: "node-01",
  name: "ESP32 node-01",
  status: "online",
  temperature: 24.7,
  humidity: 50,
  gasLevel: 105,
  gasAdc: 430,
  actuatorState: { relayActive: false, fanActive: false, buzzerActive: false },
  actuatorStateStale: false,
  automationEnabled: true,
  lastSeen: "2026-10-10T09:29:58.000Z",
};

function telemetry(overrides: Partial<TelemetryStreamMessage> = {}): TelemetryStreamMessage {
  return {
    type: "telemetry",
    eventId: "900002",
    nodeId: "node-01",
    timestamp: "2026-10-10T09:29:59.000Z",
    temperature: 61,
    humidity: 50,
    gasLevel: 100,
    gasAdc: 410,
    isAnomaly: false,
    ...overrides,
  };
}

function point(eventId: string, timestampMs: number, temperature: number): TelemetryPoint {
  return {
    eventId,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    temperature,
    humidity: 50,
    gasLevel: 100,
    isAnomaly: false,
  };
}

function log(id: string, message: string): ActionLogEntry {
  return {
    id,
    timestamp: "09:29:59 AM",
    nodeId: "node-01",
    eventType: "actuator_command",
    message,
    source: "AWS IoT Core",
    severity: "info",
  };
}

test("a fresh temperature WebSocket frame updates the current tile state and chart point", () => {
  const incoming = telemetry();
  const nextNodes = applyTelemetryToNodes([currentNode], incoming, now);
  const chartPoint = telemetryMessageToPoint(incoming);

  assert.equal(nextNodes[0].temperature, 61);
  assert.equal(nextNodes[0].lastSeen, incoming.timestamp);
  assert.equal(nextNodes[0].status, "online");
  assert.equal(chartPoint?.temperature, 61);
  assert.equal(chartPoint?.timestampMs, Date.parse(incoming.timestamp));
});

test("an older telemetry frame cannot roll the live tile backward", () => {
  const stale = telemetry({ timestamp: "2026-10-10T08:46:46.000Z", temperature: 61 });
  const nodes = [currentNode];

  assert.equal(applyTelemetryToNodes(nodes, stale, now), nodes);
  assert.equal(nodes[0].temperature, 24.7);
});

test("invalid telemetry timestamps are rejected instead of relabeled as current", () => {
  const invalid = telemetry({ timestamp: "not-a-date" });

  assert.equal(telemetryMessageToPoint(invalid), undefined);
  assert.equal(applyTelemetryToNodes([currentNode], invalid, now)[0], currentNode);
});

test("chart history sorts points, deduplicates retransmits, and retains sequence reuse after reboot", () => {
  const first = point("1", now - 4_000, 24.7);
  const second = point("2", now - 2_000, 61);
  const rebootedSequence = point("1", now, 24.8);

  const merged = mergeTelemetryPoints([second, first], [second, rebootedSequence]);

  assert.deepEqual(merged.map((entry) => entry.temperature), [24.7, 61, 24.8]);
});

test("a late initial API snapshot cannot replace newer WebSocket state", () => {
  const oldSnapshot = { ...currentNode, temperature: 24.7, lastSeen: "2026-10-10T09:29:57.000Z" };
  const liveNode = { ...currentNode, temperature: 61, lastSeen: "2026-10-10T09:29:59.000Z" };

  const merged = mergeNodeSnapshot([liveNode], [oldSnapshot]);

  assert.equal(merged[0], liveNode);
  assert.equal(merged[0].temperature, 61);
});

test("live action acknowledgements are not lost when the initial log request finishes", () => {
  const ack = log("action-1", "Relay on: applied");
  const staleSnapshot = log("action-1", "Older snapshot version");
  const snapshotEntry = log("action-2", "Previous relay action");

  const merged = mergeActionLogs([ack], [staleSnapshot, snapshotEntry]);

  assert.deepEqual(merged.map((entry) => entry.message), ["Relay on: applied", "Previous relay action"]);
});
