# FleetMind project status and handoff

Last consolidated: 2026-10-18. This is the resume point for the next work
session. The EC2 health-monitor service is running; next verify the enabled
device metric and complete CloudWatch alarm acceptance. The ML detector remains
offline/future work.

## Overall completion

**Estimated completion: about 70% of the core prototype.** This is a
scope-based planning estimate, not a measure of production readiness. The
device-to-cloud telemetry path, live dashboard, manual relay, and demo threshold
automation loop have been exercised. The device-health feature is partially
deployed and remains outside that 70% estimate. Bedrock explanation and Athena
are not implemented. The ML detector is an offline experiment, not a live
feature. Hosting, security/operations hardening, broader multi-node tests, and
acceptance testing also remain.

| Workstream | Current state | Remaining work |
| --- | --- | --- |
| ESP32 telemetry and status | Board has sent live sensor readings and online/offline/relay status; user confirmed approximately 2-second readings and live chart/state updates. | Retest with each actual node ID; hardware serial/USB troubleshooting can resume when needed. |
| AWS ingestion and storage | IoT rules route telemetry, status, and actuator acknowledgements into Lambda; DynamoDB and S3 writes are configured. | Review CDK/live-resource drift before any stack deployment; test edge cases and data retention. |
| Dashboard monitoring | Monitoring, node selector, live chart, telemetry tiles, alert overlay, and Alerts & activity drawer are implemented locally. | Browser acceptance with current AWS events; verify responsive layout and multiple real node IDs. |
| Analysis page | Dedicated `/analysis` page includes recent-window sensor summaries and charts/alert distribution. | Confirm its values and historical range match the API data on a live multi-node run. |
| Manual relay loop | Board test confirmed relay click/LED state and acknowledged ON/OFF state in dashboard. | Optional retry/failure UX and additional board/load checks. |
| Threshold automation | User confirmed synthetic temperature test caused physical relay ON and OFF and received MQTT acknowledgement. | Exercise hysteresis/cooldown boundaries and automation failure cases with a harmless low-voltage load. This is demo logic, not calibrated gas detection. |
| Multi-node/offline alerts | Frontend no longer assumes `node-01`; Lambda rejects MQTT telemetry unless that node has a fresh explicit online status. AWS package hash matches the latest offline-gating ZIP. | Perform live online/offline tests for each node ID and verify rejection/acceptance in logs, DynamoDB, and UI. |
| Offline ML experiment | Prototype is merged to `main` but is not deployed. On the supplied holdout, it flagged 19 user-confirmed normal room readings and one synthetic 61°C test reading. | Keep it out of live alerts and relay control. Revisit after collecting reviewed, safely generated evaluation examples and reducing false alarms. |
| Threshold-alert explanations | Existing threshold rules already create demo alert events. Bedrock explanation has not been implemented. | Optionally send the threshold result and its measured values/reason to Bedrock for a short explanation in the activity log/SNS message. Keep alert decisions in existing code and provide a fixed-text fallback. |
| EC2 health monitor, CloudWatch, and SNS | Lambda monitoring route and EC2 publisher deployed in `ap-southeast-2`; monitor timer is active and `MonitorHeartbeat=1` has been verified. The `node-01` switch is still off, and CloudWatch alarms have not been created. | Enable the `node-01` switch, verify `StatusWithin180Seconds=1`, create the device/monitor/EC2 alarms, then run a controlled connectivity test. This is for connectivity/system health, not ML gas-anomaly decisions. |
| S3 history analysis and EC2 access | Session Manager access is working for the new EC2 instance; Athena is not configured. | Use Athena to query approved S3 telemetry; continue managing EC2 through Session Manager without public SSH. |
| Production operation | Current regional resources are in `ap-southeast-2`; infrastructure source is CDK but live resources were configured/updated manually. | Reconcile drift, finish hosted frontend/domain and operational alerting, review security/cost/retention, and run a final acceptance pass. |

## What is working end to end

1. ESP32 publishes to `fleetmind/<nodeId>/telemetry`; separate status and event
   topics carry online/offline state and actuator acknowledgements.
2. Enabled AWS IoT rules invoke `fleetmind-telemetry-api` in
   `ap-southeast-2`.
3. Lambda validates firmware-format or normalized MQTT test-client telemetry,
   stores readings/events in DynamoDB and raw JSON in S3, then broadcasts live
   frames over API Gateway WebSocket.
4. The authenticated Next.js dashboard gets node/log/history snapshots from
   the HTTP API and applies WebSocket events without requiring a page reload.
5. Manual and threshold-based relay requests use the existing IoT command topic;
   the device acknowledgement updates state and the activity log.

The current dashboard threshold indicators are **prototype/demo alerts**:
MQ-2 relative value 400/1000 and temperature 60 °C (with 350/1000 and 58 °C
OFF hysteresis in the demo automation). MQ-2 is not calibrated, does not report
CO ppm, and is not a certified life-safety device. Keep certified CO alarms
independent and do not test by releasing gas or applying unsafe heat.

## Immediate next steps

1. Live-test the latest pushed dashboard changes: verify alerts stay visible
   until acknowledged and only configured node IDs appear.
2. Re-run the safe threshold-alert test on an online node. Check the live tile,
   chart, overlay, activity log, and that the existing threshold values have not
   changed. Do not use the ML model for this test.
3. Continue the deployed EC2 health-monitor setup using
   [`cloud-health-monitor-console-guide.md`](cloud-health-monitor-console-guide.md): enable `node-01`, verify the device metric, create CloudWatch alarms, and perform safe SNS acceptance tests.
4. Add Bedrock explanations only after a threshold alert exists; keep a fixed
   explanation fallback and do not let Bedrock trigger alerts or relays.
5. Query the existing approved S3 telemetry with Athena and set up Session
   Manager access for EC2. Check project spend and selected Region before any
   resource creation.

## Deferred ML infrastructure

The earlier Phase 5/6 proposal for EC2 model training, ECR, K3s inference, Lambda
model scoring, SNS ML alerts, and model-triggered relay is deferred. Do not
provision or deploy this path as part of the next monitoring work. The saved
prototype is not reliable enough for live alerts: it flagged 19 readings
confirmed normal by the user and one synthetic high-temperature test. See
[`anomaly-service-plan.md`](anomaly-service-plan.md) for the historical design
and dataset constraints.

Dataset rows should preserve node ID, sequence, device timestamp and server
`receivedAt`, temperature in °C, humidity percentage, raw MQ-2 ADC, relative gas
estimate, sensor validity, relay state, uptime, schema version, and data-quality
reasons. Use chronological/session-aware evaluation splits. Isolation Forest can
fit unlabeled normal data, but reviewed controlled labels are needed to estimate
false positives and missed events and to choose a useful threshold. A few hours
or days of data are a starting point, not evidence of safety or accuracy.

The teammate's Git branch does not isolate shared AWS resources. Keep cloud
changes reviewed; confirm service availability in `ap-southeast-2` and project
spend limits before creating EC2, SNS, CloudWatch, Bedrock, or Athena resources.
Do not share credentials or deploy unreviewed code to live resources.

## Live AWS scan: findings and caveats

Read-only AWS inspection confirmed the MQTT rules, expected HTTP/WebSocket
routes, Lambda-to-DynamoDB/S3/IoT permissions, and WebSocket
`execute-api:ManageConnections` permission are present. The deployed Lambda
package SHA-256 (Base64) matches
`infra/fleetmind-multinode-offline-alert-fix-20261010.zip`. No AWS resources
were changed by the scan.

The scan found configuration drift between live resources and local CDK:

- Live HTTP API has `GET /telemetry` but no `POST /telemetry`, which local CDK
  declares. MQTT test-client publishes do not use this HTTP route.
- Live status rule is named `FleetMindNodeStatus`; local CDK declares
  `FleetMindStatusToLambda`.
- Live WebSocket stage is `production`; local CDK declares `prod`.
- Live telemetry Lambda runtime is Node.js 24; local CDK declares Node.js 22.

These differences do not block the current MQTT → Lambda → database/WebSocket →
dashboard alert path. Before running CDK deploy, inspect and reconcile the diff
to avoid duplicate rules, route changes, or stage/runtime replacements. The
current `GET /logs` route and WebSocket permissions already support the activity
drawer; no additional AWS permission or route is required for it.

## Validation and worktree notes

At handoff, verification passed: dashboard tests 10/10, MQTT offline-policy
tests 4/4, infrastructure TypeScript typecheck, dashboard TypeScript check,
Next.js production build, and `git diff --check`. The production build passes;
the previously captured local dev error was a blocked Google Fonts request
(`connect EACCES`), not an AWS route/permission failure. The exact browser error
from the latest report was not attached, so capture the current browser console
or Network error if one persists.

The Lambda deployment ZIPs and generated build folders are local artifacts and
are not source-of-truth; this handoff pushes source, tests, and documentation.
