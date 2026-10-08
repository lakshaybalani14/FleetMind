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
- Leaving the AWS IoT MQTT test client page ends that page's own subscription; it
  does not disconnect the ESP32 or stop the IoT rule from processing device
  publishes.

## Current timing and status behavior

| Part | Current behavior | Effect |
| --- | --- | --- |
| Sensor sampling | Firmware samples every 2 seconds | Readings are available locally at this cadence. |
| Telemetry publishing | Change-filtered; maximum quiet interval is 30 seconds | A steady graph may not receive a new point for up to 30 seconds. |
| Device status | Firmware publishes a retained status heartbeat every 15 seconds and configures an MQTT Last Will | The device already reports online/offline information on a separate MQTT topic. |
| AWS ingestion rule | Currently selects `fleetmind/+/telemetry` | Status heartbeats and Last Will messages are not currently forwarded into the dashboard backend. |
| Dashboard stale timeout | Marks telemetry offline after 90 seconds without a telemetry update | Offline indication can lag behind a disconnect; previous actuator state may remain visible until the next telemetry event. |

## Next live-test work

1. Keep the telemetry change filter, but consider reducing the maximum quiet
   interval from 30 seconds to 10 seconds so the graph gets a regular point more
   often.
2. Add an AWS IoT rule for `fleetmind/+/status` that invokes the existing
   telemetry Lambda. Keep the current telemetry rule in place.
3. Update the Lambda to recognize status heartbeat and Last Will payloads,
   update the latest node status/actuator state, and broadcast a separate
   WebSocket status message.
4. Update the dashboard to apply those status messages immediately and show
   actuator state as stale/unknown when the node is offline rather than implying
   that an old state is current.
5. Test normal updates, MQTT disconnect, reconnect, and relay changes while
   watching CloudWatch and browser WebSocket frames.

The firmware interval and Lambda/frontend changes are source-code work. The new
status-topic rule is an AWS Console action and should be validated before any
production deployment.

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
- If node or relay status is stale, verify that the status topic is being routed
  to and handled by the backend; telemetry alone cannot deliver the separate
  heartbeat/LWT events.
