# FleetMind project status and handoff

Last consolidated: 2026-10-10. This is the resume point for the next work
session and the teammate's anomaly-service branch.

## Overall completion

**Estimated completion: about 70% of the agreed prototype scope.** This is a
scope-based planning estimate, not a measure of production readiness. The
device-to-cloud telemetry path, live dashboard, manual relay, and demo threshold
automation loop have been exercised. The Isolation Forest service and its
closed-loop integration are not implemented yet and make up the largest
remaining feature milestone. Hosting, security/operations hardening, broader
multi-node tests, and acceptance testing also remain.

| Workstream | Current state | Remaining work |
| --- | --- | --- |
| ESP32 telemetry and status | Board has sent live sensor readings and online/offline/relay status; user confirmed approximately 2-second readings and live chart/state updates. | Retest with each actual node ID; hardware serial/USB troubleshooting can resume when needed. |
| AWS ingestion and storage | IoT rules route telemetry, status, and actuator acknowledgements into Lambda; DynamoDB and S3 writes are configured. | Review CDK/live-resource drift before any stack deployment; test edge cases and data retention. |
| Dashboard monitoring | Monitoring, node selector, live chart, telemetry tiles, alert overlay, and Alerts & activity drawer are implemented locally. | Browser acceptance with current AWS events; verify responsive layout and multiple real node IDs. |
| Analysis page | Dedicated `/analysis` page includes recent-window sensor summaries and charts/alert distribution. | Confirm its values and historical range match the API data on a live multi-node run. |
| Manual relay loop | Board test confirmed relay click/LED state and acknowledged ON/OFF state in dashboard. | Optional retry/failure UX and additional board/load checks. |
| Threshold automation | User confirmed synthetic temperature test caused physical relay ON and OFF and received MQTT acknowledgement. | Exercise hysteresis/cooldown boundaries and automation failure cases with a harmless low-voltage load. This is demo logic, not calibrated gas detection. |
| Multi-node/offline alerts | Frontend no longer assumes `node-01`; Lambda rejects MQTT telemetry unless that node has a fresh explicit online status. AWS package hash matches the latest offline-gating ZIP. | Perform live online/offline tests for each node ID and verify rejection/acceptance in logs, DynamoDB, and UI. |
| ML anomaly service (Phase 5) | Plan and dataset/API contract are documented; implementation is queued for teammate's separate branch. | Prepare/clean normal data, train/evaluate Isolation Forest, build FastAPI `/score`, Dockerize, publish a versioned image to ECR, and deploy to K3s on EC2 with a secured Lambda connection. |
| ML-driven automation and notifications (Phase 6) | Existing IoT command/ack path can be reused; no model score flow or SNS anomaly alerts yet. | Persist deduplicated `AnomalyEvent`, publish SNS alert, trigger relay via current command path, prevent repeated command/alert storms, and measure the sub-5-second reading-to-ack target. |
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

1. Start the dashboard and sign in as usual. Open Alerts & activity and keep the
   Lambda CloudWatch log stream available. MQTT test-client subscription is
   separate from the ESP32 connection and ends when leaving that console page.
2. With the target node online, publish a fresh valid high-temperature or
   high-relative-gas test payload to its own
   `fleetmind/<nodeId>/telemetry` topic. Expect the matching node's live value,
   chart point, alert overlay/drawer item, and `anomaly_detected` activity row.
   Use the current node ID, unique event/sequence value, and current timestamp.
3. Publish a status-offline event (or disconnect the target device), then try a
   telemetry test for that node. Expect Lambda to return/reason `node_offline`
   and **no new telemetry history, alert, or live telemetry frame**. Reconnect
   and wait for a fresh online status before repeating the accepted test.
4. Repeat for a second node ID if available. Confirm the UI and event are not
   hard-coded to `node-01`. See the step-by-step checklist in
   [`live-testing-log.md`](live-testing-log.md).
5. Teammate proceeds on a feature branch with Phase 5 from
   [`anomaly-service-plan.md`](anomaly-service-plan.md). Review and merge source
   through a PR; do not deploy an unreviewed branch to live resources.

## Phase 5 and 6 AWS/data needs

Planned, not yet provisioned for the model service: an EC2 training environment;
an approved private S3 dataset/model-artifact location (do not assume the
existing telemetry-history bucket is approved for training artifacts); an ECR
repository; an EC2 inference host with K3s; and an SNS anomaly-alert topic with
approved subscribers. Lambda-to-FastAPI networking and service authentication
must be designed before enabling scores to actuate hardware. SQS is optional,
not required by the agreed direct-call approach; introduce it only if measured
throughput/retry needs justify a separate result-return path.

Dataset rows should preserve node ID, sequence, device timestamp and server
`receivedAt`, temperature in °C, humidity percentage, raw MQ-2 ADC, relative gas
estimate, sensor validity, relay state, uptime, schema version, and data-quality
reasons. Use chronological/session-aware evaluation splits. Isolation Forest can
fit unlabeled normal data, but reviewed controlled labels are needed to estimate
false positives and missed events and to choose a useful threshold. A few hours
or days of data are a starting point, not evidence of safety or accuracy.

The teammate's Git branch does not isolate shared AWS resources. Invite her
through AWS Settings → Team and share the FleetMind project with only the access
needed. Keep training/deployment changes reviewed; confirm service availability
in the selected Region and project spend limits before creating EC2/ECR/SNS
resources. Do not share credentials or deploy live resources from the feature
branch.

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
