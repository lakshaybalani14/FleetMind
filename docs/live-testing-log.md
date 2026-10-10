# FleetMind live-testing log

This document records what has been exercised against the real ESP32 and AWS
resources, what problems were found, and what remains for the next live test.
Do not put private keys, device certificates, Cognito tokens, or full WebSocket
connection IDs in this log.

## Current status — 2026-10-10

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
- The frontend now handles `node-status` WebSocket events in source, including
  online/offline and stale relay-state display. TypeScript validation passed,
  and the user confirmed the live browser behavior.
- Local firmware source now publishes unchanged readings every two seconds
  (matching its sensor sample cadence), publishes meaningful changes as soon as
  sampled, and publishes retained relay/node status immediately after a relay
  command. The user’s latest live run confirms these behaviors are active on the
  tested board.
- Local telemetry Lambda source now starts WebSocket delivery concurrently with
  DynamoDB/S3 persistence instead of waiting for all writes first. This source
  change only affects AWS after it is uploaded to the telemetry Lambda.
- In the latest live run, the user confirmed online/offline state, incoming
  readings, and the moving chart all update without a manual page reload and
  feel close enough to live for the current project. No numeric latency target
  is required before moving on.
- These dashboard/latency tasks are separate from the queued anomaly-service
  work; see [`anomaly-service-plan.md`](anomaly-service-plan.md).
- Leaving the AWS IoT MQTT test client page ends that page's own subscription; it
  does not disconnect the ESP32 or stop the IoT rule from processing device
  publishes.
- Local source now includes a complete bidirectional relay path: Cognito-
  authenticated dashboard command → API Lambda → AWS IoT command topic → ESP32
  relay → device acknowledgement → IoT rule/Lambda → DynamoDB and dashboard
  WebSocket. Both manual control and opt-in threshold automation share the same
  command/ack path. AWS Core verification on 2026-10-10 confirmed the deployed
  Lambda package matches the local actuator ZIP, the scoped IoT publish
  permission and acknowledgement rule exist, and both Cognito-protected HTTP
  routes are deployed. On 2026-10-10, the user tested manual relay ON and OFF:
  the relay clicked, the module LED changed state, and the dashboard showed
  running/standby after each command. This verifies the manual command and
  acknowledgement round trip with the board.
- Automatic mode is intentionally off unless `AUTO_CONTROL_ENABLED=true` and
  gas/temperature on/off thresholds are set. MQ-2 is now documented and labeled
  as a relative 0–1000 prototype level, not ppm or a CO measurement.
- Next: if desired, test the automatic loop with synthetic telemetry and a
  harmless low-voltage load. Demo values are gas ON/OFF 400/350 and temperature
  ON/OFF 60/58°C; these validate software behavior only and are not safety
  limits. Keep certified CO alarms independent of this project.
- Procedure and the configuration checklist: [`actuator-control.md`](actuator-control.md).

## Current timing and status behavior

| Part | Current behavior | Effect |
| --- | --- | --- |
| Sensor sampling | Firmware samples every 2 seconds | Readings are available locally at this cadence. |
| Telemetry publishing | Meaningful changes publish immediately after sampling; unchanged readings publish every 2 seconds | The user confirmed the dashboard readings and moving chart update without manual refresh. |
| Device status | Firmware publishes retained heartbeat every 15 seconds, immediate retained status after relay commands, and configures an MQTT Last Will | Online/offline and relay status use the separate MQTT status topic. |
| AWS ingestion rules | Separate rules select `fleetmind/+/telemetry` and `fleetmind/+/status` | Telemetry and heartbeat/Last Will status are routed to the Lambda backend. |
| Status update path | Status Lambda updates the latest node item and broadcasts `node-status`; the frontend consumes it | The user confirmed online/offline display works during the live run. |
| Dashboard stale timeout | Existing telemetry timeout is 90 seconds | The UI should use status events immediately and mark actuator state stale/unknown while offline. |

## Next live-test work

1. Continue with the anomaly-service workstream described in
   [`anomaly-service-plan.md`](anomaly-service-plan.md).
2. Revisit numeric latency measurement only if a future test shows noticeable
   lag, stale readings, or delayed online/offline transitions.

The status rule and Lambda path are configured and validated in the console.
The latest live run confirmed the end-to-end dashboard behavior; no additional
latency tuning is blocking the next project task.

## Repeatable live-test checklist

## 2026-10-10 — Dashboard synthetic temperature / relay orchestration

- User confirmed the test MQTT payload caused a physical relay click and the
  MQTT acknowledgement was received. This verifies the command/ack path; it
  does not by itself verify that the telemetry value reached the chart.
- Root-cause checks found two visibility/order conditions: the chart defaults
  to MQ-2 Level rather than Temperature, and the previously shared sample
  timestamp was stale relative to current live telemetry. Valid, older frames
  can remain in chart history, but must never roll the current-value tiles
  backward. A current ESP32 sample can also
  quickly replace a synthetic value on the latest-temperature tile.
- Frontend stream handling now validates event timestamps and numeric readings,
  deduplicates chart points without conflating sequence IDs reused after device
  reboot, rejects stale values for current tiles, and preserves newer live
  WebSocket state if the initial HTTP snapshot resolves later. Live action
  acknowledgements are also preserved if the initial log request finishes late.
- Added six automated tests for fresh readings, stale-event protection, invalid
  timestamps, chart ordering/deduplication/sequence reuse, HTTP-vs-WebSocket
  race behavior, and acknowledgement-vs-log-snapshot race behavior.
- Verification: dashboard tests passed (6/6), root TypeScript check passed,
  infrastructure TypeScript check passed, and the Next.js production build
  completed successfully. No browser/device retest was run in this local code
  session.
- Retest: send a new synthetic telemetry event with a fresh timestamp, select
  **Temperature** in the chart, and compare the event across CloudWatch,
  DynamoDB, the live tile, and chart. See the synthetic telemetry checklist in
  [`actuator-control.md`](actuator-control.md).
- User retested with a newly generated Unix timestamp and confirmed the
  temperature spike appeared. The earlier timestamp example was stale by the
  time it was reused; the dashboard now behaves as expected with a fresh event.
- User confirmed the automatic threshold OFF action also worked after the
  synthetic high-temperature test. Together with the earlier ON relay click and
  MQTT acknowledgement, this verifies the demo threshold ON/OFF loop through
  the device. It does not validate calibrated gas detection, and hysteresis
  boundary/cooldown behavior was not separately measured.

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
- If a point arrives only after a long pause with no sensor change, confirm the
  updated firmware is flashed and publishing every two seconds.
- If node or relay status is stale, first check for a `node-status` WebSocket
  frame. If it is present, inspect the frontend event handler; if absent, check
  the status IoT rule and Lambda CloudWatch logs.
