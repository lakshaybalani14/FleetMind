# FleetMind live-testing log

This document records what has been exercised against the real ESP32 and AWS
resources, what problems were found, and what remains for the next live test.
Do not put private keys, device certificates, Cognito tokens, or full WebSocket
connection IDs in this log.

## Current status — 2026-10-09

- The ESP32 connected to AWS IoT Core and telemetry was visible in the MQTT test
  client.
- The telemetry pipeline was confirmed working through the IoT rule, Lambda,
  DynamoDB, and S3.
- The dashboard initially needed a reload to see newer values. CloudWatch showed
  that Lambda's WebSocket callback was rejected with `403 AccessDeniedException`.
- The Lambda role's `execute-api:ManageConnections` permission was updated to
  cover the per-connection callback ARN:
  `arn:aws:execute-api:ap-southeast-2:<project-account>:<websocket-api-id>/<stage>/POST/@connections/*`.
- The user reports that live dashboard updates are now working after that
  permission correction.
- A separate AWS IoT Core rule for `fleetmind/+/status` was added and exercised.
  The updated telemetry Lambda completed successfully, and the DynamoDB item
  `PK=FLEET`, `SK=NODE#node-01` showed the expected online status, `lastSeen`,
  RSSI, uptime, and command-queue flag. The Lambda also broadcasts a distinct
  `node-status` WebSocket event.
- The remaining board-free live-dashboard task is to consume `node-status`
  events in the frontend so online/offline and stale actuator state change
  without a page reload. This is separate from the queued anomaly-service work;
  see [`anomaly-service-plan.md`](anomaly-service-plan.md).
- Leaving the AWS IoT MQTT test client page ends that page's own subscription; it
  does not disconnect the ESP32 or stop the IoT rule from processing device
  publishes.

## Current timing and status behavior

| Part | Current behavior | Effect |
| --- | --- | --- |
| Sensor sampling | Firmware samples every 2 seconds | Readings are available locally at this cadence. |
| Telemetry publishing | Change-filtered; maximum quiet interval is 30 seconds | A steady graph may not receive a new point for up to 30 seconds. |
| Device status | Firmware publishes a retained status heartbeat every 15 seconds and configures an MQTT Last Will | The device already reports online/offline information on a separate MQTT topic. |
| AWS ingestion rules | Separate rules select `fleetmind/+/telemetry` and `fleetmind/+/status` | Telemetry and heartbeat/Last Will status are routed to the Lambda backend. |
| Status update path | Status Lambda updates the latest node item and broadcasts `node-status` | Cloud-to-WebSocket status path is implemented; frontend event consumption still needs validation. |
| Dashboard stale timeout | Existing telemetry timeout is 90 seconds | The UI should use status events immediately and mark actuator state stale/unknown while offline. |

## Next live-test work

1. Update the dashboard WebSocket handler to apply `node-status` events
   immediately, including online/offline, `lastSeen`, and stale actuator state.
2. Test online → offline → online with status messages while the dashboard stays
   open; verify there is no reload and no stale offline state after reconnect.
3. When the ESP32 is available, repeat the test with a real disconnect/reconnect
   and relay changes while watching CloudWatch and browser WebSocket frames.
4. Separately, build the anomaly-service workstream described in
   [`anomaly-service-plan.md`](anomaly-service-plan.md). Keep the 30-second
   telemetry quiet-interval tuning as a later, board-dependent latency task.

The status rule and Lambda path are already configured and validated in the
console. The immediate dashboard task is source-code work; no AWS console change
is expected for it.

## Repeatable live-test checklist

### Before testing

- Confirm the ESP32 is connected and is publishing the expected
  `fleetmind/<nodeId>/telemetry` topic.
- Confirm `FleetMindTelemetryToLambda` is enabled in the selected Region.
- Open the dashboard and make sure its WebSocket connection is established.
- Open the telemetry Lambda's CloudWatch log group.

### During testing

- Change a sensor reading enough to pass the firmware's edge-change threshold;
  verify the dashboard's recent value and chart update without a page reload.
- Change the relay state; verify the dashboard's actuator state follows it.
- Disconnect the ESP32 and note the time until the dashboard reports it offline.
- Reconnect it and verify that the dashboard reports online and shows the current
  actuator state, not the previous state.
- In browser DevTools, inspect Network → WS → Messages for telemetry frames.
- In CloudWatch, check for `WebSocket delivery failed`, especially 403
  authorization failures and stale-connection/Gone responses.

### Interpret results

- If history is fresh after reloading but the open chart does not move, check the
  WebSocket frames and Lambda callback logs; persistence is working but the live
  push path is not.
- If the IoT test client stops displaying messages after navigating away, return
  to it and subscribe again. Its display is independent of device publishing and
  dashboard delivery.
- If a point arrives only after a long pause with no sensor change, check the
  firmware telemetry quiet interval and its change thresholds.
- If node or relay status is stale, first check for a `node-status` WebSocket
  frame. If it is present, inspect the frontend event handler; if absent, check
  the status IoT rule and Lambda CloudWatch logs.
