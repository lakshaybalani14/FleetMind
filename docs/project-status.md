# FleetMind project status

Last reviewed: **2026-10-18**. This is the current project handoff. Live AWS setup details are based on the user's console checks unless explicitly marked as independently verified below.

## Overall status

**Estimated completion: about 80% of the demo prototype.** The main device-to-dashboard loop and the selected cloud features are implemented and have been exercised. This is a planning estimate; the project is not production-ready or a certified safety system.

| Workstream | Status | Remaining |
| --- | --- | --- |
| ESP32 sensor telemetry and status | Board readings, heartbeat/status updates, dashboard freshness behavior, and real-time updates have been exercised. | Repeat acceptance with each physical node ID and document any board-specific pin differences. |
| AWS ingestion and persistence | IoT rules invoke the telemetry Lambda; readings and events are written to DynamoDB and raw telemetry to S3. | Reconcile console resources against CDK before any stack deployment; review retention and failure behavior. |
| Dashboard | Authenticated dashboard, node selection, live cards/chart, alert overlay, analysis view, and activity drawer are implemented. | Final browser acceptance for responsive layout, alert persistence, and multi-node behavior. |
| Threshold alerts | Existing gas-relative-level and temperature conditions create activity events. A synthetic high reading was used to verify the flow. | Keep values explicitly documented as demo thresholds; test software boundaries with safe synthetic input only. |
| Manual relay | Board changed relay state and returned acknowledgement; dashboard displayed the confirmed state. | Confirm the latest retained action-history change with one relay toggle while telemetry continues. |
| Automatic relay demo | User confirmed synthetic temperature test caused relay ON then OFF with MQTT acknowledgement. | Optionally test hysteresis/cooldown boundaries using a harmless low-voltage load. |
| Alert history | Alert visibility was fixed by mirroring alerts to an alert partition. The current activity-history ZIP is deployed and its Lambda hash was independently matched on 2026-10-18. | Confirm relay ACK remains in activity after new telemetry arrives. |
| Bedrock explanations | Nova Micro is enabled for short explanations of existing threshold alerts; a synthetic alert explanation appeared in the dashboard. Fallback wording is retained. | Optional: review cost/latency and verify fallback behavior after a controlled Bedrock failure. It must not decide alerts or relay actions. |
| Device-health SNS notifications | User reports the per-node monitoring switch, 180-second missing-status rule, CloudWatch alarms, and SNS acceptance test are working. Dashboard online/offline behavior remains separate. | Repeat final acceptance with monitoring enabled and disabled when the EC2 monitor and board are available; record exact test date/results. |
| Offline ML experiment | Python models and score files are evaluation-only. On the reviewed holdout, 19 normal room readings and one synthetic 61 °C test were flagged. | Do not connect it to dashboard alerts, SNS, or relay. Reconsider only with reviewed, representative FleetMind data and measured false-positive/false-negative results. |
| S3 history / Athena | Raw history is stored in S3. | Athena analysis is optional future work; it is not required for the current live dashboard. |
| Production operation | Regional resources are in `ap-southeast-2`; local CDK describes intended infrastructure. | Reconcile CDK drift, publish/host the dashboard as needed, finish security/cost/retention review, and run a broader acceptance pass. |

## What has been demonstrated end to end

1. ESP32 publishes sensor readings to `fleetmind/{nodeId}/telemetry`, retained status to `fleetmind/{nodeId}/status`, and actuator acknowledgements to `fleetmind/{nodeId}/events`.
2. AWS IoT rules invoke `fleetmind-telemetry-api` in `ap-southeast-2`.
3. The Lambda validates and normalizes payloads, stores telemetry and event history in DynamoDB, writes ingested telemetry JSON to S3, and broadcasts live events over API Gateway WebSocket.
4. The authenticated dashboard shows readings and status without requiring a page refresh.
5. A relay request is correlated with a device acknowledgement and persisted as an action event.
6. A threshold-crossing test appears in activity history. Bedrock can add explanation text after the threshold code has already determined that an alert exists.
7. The separate health monitor reports CloudWatch metrics for enabled devices and sends SNS alerts through configured CloudWatch alarms, according to the user's live console verification.

## Prototype thresholds and safety boundary

The current Lambda demo alert conditions are MQ-2 relative level `>= 400 / 1000` or temperature `>= 60 °C`; the firmware carries a threshold-derived `isAnomaly` flag. The gas value is a relative estimate scaled from raw ADC, not calibrated ppm and not a carbon-monoxide measurement. Keep certified CO alarms independent. Do not release gas, create smoke, or apply unsafe heat as a test.

Automatic relay behavior has extra gates: the deployment must permit it, the node must be online, the dashboard mode must be automatic, threshold settings must be valid, and the cooldown must allow a command. A threshold alert by itself is not proof that the relay moved; the board acknowledgement is the confirmation.

## Current follow-up list

1. Toggle the relay once after the latest Lambda package deployment; verify its row stays visible in **Alerts & activity** despite incoming telemetry.
2. With the board and health monitor available, verify `StatusWithin180Seconds=1` while the node is online and monitoring is enabled; verify an SNS outage alert after status is absent for over 180 seconds plus alarm evaluation; verify monitoring OFF suppresses the device alert while dashboard online/offline continues updating.
3. Run the final safe threshold test and inspect the tile/chart/overlay/activity row and explanation. Use a fresh timestamp and label the payload synthetic.
4. Push the current source/documentation changes to GitHub after reviewing the diff. Keep ZIP packages, local generated bundles, datasets with sensitive data, and build output out of the source commit unless specifically intended.
5. Before CDK deployment, compare the synthesized template to live AWS resources and resolve the known differences below.

## Known infrastructure differences to resolve before CDK deployment

The live AWS resources were configured/updated manually. Previous review found these differences from `infra/lib/fleetmind-stack.ts`:

- Live HTTP API has `GET /telemetry`; the CDK stack also declares `POST /telemetry`.
- Live status IoT rule was named `FleetMindNodeStatus`; CDK declares `FleetMindStatusToLambda`.
- Live WebSocket stage was `production`; CDK declares `prod`.
- Live telemetry Lambda runtime was Node.js 24; CDK declares Node.js 22.

These differences did not block the observed MQTT-to-dashboard path. Do not deploy the entire stack until the current console state and synthesized diff have been reviewed.

## Git and deployment handoff

At the time of this review, `main` matches `origin/main` at `edb0a6f`, while the activity-history source changes in `infra/lambda/index.ts` and `src/lib/fleet-stream.ts` are local modifications. The Lambda ZIP `infra/fleetmind-activity-history.zip` is an untracked deployment artifact. There are additional untracked ZIP/build artifacts in the workspace; inspect `git status` and stage only the intended source/docs before committing.

The deployed Lambda package hash independently observed in the AWS Console is `1JCEkz2hFyH+cVY1ILlgvLcNdRZeX2mjL3mq6AuuNZA=`. This confirms the activity-history package was uploaded; it does not by itself confirm a fresh relay ACK has been exercised after deployment.

## Resume guide

- Full event data path: [Project events and workflows](project-events.md)
- Console setup and acceptance: [Cloud-health monitor guide](cloud-health-monitor-console-guide.md)
- Observed checks and dated changes: [Live-testing log](live-testing-log.md)
- Board pinout and firmware: [Firmware README](../firmware/README.md)
- AWS routes and infrastructure caveats: [Infrastructure README](../infra/README.md)
- ML scope and dataset limitations: [Anomaly-service plan](anomaly-service-plan.md)
