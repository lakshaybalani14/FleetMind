import assert from "node:assert/strict";
import test from "node:test";
import { canAcceptMqttTelemetry } from "./telemetry-policy";

const now = Date.parse("2026-10-10T16:30:00.000Z");

test("MQTT telemetry is accepted for a recently online node", () => {
  assert.equal(canAcceptMqttTelemetry({
    status: "online",
    lastSeen: "2026-10-10T16:29:30.000Z",
  }, now), true);
});

test("MQTT telemetry cannot revive an explicitly offline node", () => {
  assert.equal(canAcceptMqttTelemetry({
    status: "offline",
    lastSeen: "2026-10-10T16:29:59.000Z",
  }, now), false);
});

test("MQTT telemetry is rejected after online freshness expires", () => {
  assert.equal(canAcceptMqttTelemetry({
    status: "online",
    lastSeen: "2026-10-10T16:28:29.000Z",
  }, now), false);
});

test("missing or invalid node status timestamps are not considered online", () => {
  assert.equal(canAcceptMqttTelemetry(undefined, now), false);
  assert.equal(canAcceptMqttTelemetry({ status: "online", lastSeen: "invalid" }, now), false);
});
