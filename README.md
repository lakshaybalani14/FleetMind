# FleetMind

IoT fleet telemetry and edge automation prototype built around an ESP32 node,
AWS IoT Core, a Lambda-backed API, and a live Next.js dashboard.

## Run the dashboard locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Configure the public frontend settings in
`.env.local` using `.env.local.example`; Cognito sign-in and the HTTP/WebSocket
API need the values from the AWS environment. Do not commit `.env.local`, device
secrets, or credentials.

## Current project status

Overall estimate: **about 70% of the core prototype is complete**. This is a
planning estimate, not a production-readiness rating. The sensor telemetry,
dashboard, and relay loop are working. The newly agreed cloud-monitoring and
notification features have not been built yet. The ML anomaly model remains an
offline experiment and is not part of the live alert path. See
[`docs/project-status.md`](docs/project-status.md) for the full handoff and next
steps.

| Area | Status |
| --- | --- |
| ESP32 firmware | User confirmed the live board test works with 2-second telemetry updates and immediate relay-status updates. |
| AWS IoT Core | Device connection and telemetry topic verified. `FleetMindTelemetryToLambda` routes `fleetmind/+/telemetry` to the ingestion Lambda. |
| Storage and backend | Live telemetry has been verified through Lambda, DynamoDB, and S3. |
| Authentication and APIs | Cognito-authenticated HTTP API and API Gateway WebSocket dashboard flow are configured and working. |
| Dashboard and relay control | Live readings/status and manual relay ON/OFF have been verified on the board. Synthetic telemetry also verified automatic threshold ON and OFF with device acknowledgement. MQ-2 is a relative prototype level, not CO ppm; automatic demo mode remains opt-in. |
| Dashboard alerts and analytics | Source now keeps alerts pending until acknowledged and filters nodes against configured IDs. It also includes alert markers, sensor-rich logs, filters, and recent-reading analysis. Live retest of the latest alert-persistence/node-filtering changes is pending. These remain demo threshold warnings, not a certified safety alarm. |
| Infrastructure source | CDK source is in `infra/`; the current AWS resources were configured manually, so review differences before any CDK deployment. |
| Live-test follow-up | User confirmed online/offline status, live readings, moving chart, manual relay, and synthetic threshold ON/OFF with device acknowledgement. The latest dashboard alert-persistence and configured-node changes are pushed to `main` but need a live retest. See [`docs/live-testing-log.md`](docs/live-testing-log.md). |

## Resume live testing

1. Optionally test threshold hysteresis-band and cooldown edge cases with
   synthetic telemetry and a harmless load, following
   [`docs/actuator-control.md`](docs/actuator-control.md). MQ-2 levels are not
   gas ppm or a CO safety measurement.
2. Keep certified CO alarms as the real life-safety protection; do not connect
   the prototype relay to safety-critical equipment.
3. Keep the ML prototype offline. It flagged 19 readings the user confirmed
   were normal and one synthetic 61°C test reading. Do not connect its results
   to the dashboard, SNS, or relay. Revisit it only after collecting reviewed
   test examples; see [`docs/anomaly-service-plan.md`](docs/anomaly-service-plan.md).
4. Plan the next cloud-monitoring feature: an EC2 device-health monitor with
   CloudWatch metrics/alarms and SNS notifications for device/system health.
   Bedrock may explain existing threshold alerts in plain language; it must not
   decide whether to alert or control the relay.
5. Add Athena queries for historical S3 telemetry and use Systems Manager
   Session Manager to access EC2 without opening SSH to the internet.
6. Revisit latency measurements only if future live tests show noticeable lag
   or stale dashboard state.
7. Re-run the safe synthetic alert test on an online node and test that publishes
   are rejected while it is offline. Verify every node ID independently, the
   activity drawer, temperature chart spike, full-screen alert, and event log.
   The thresholds are demo values, not calibrated gas limits. See
   [`docs/live-testing-log.md`](docs/live-testing-log.md).

The hands-on setup, observed behavior, and repeatable test checklist are in
[`docs/live-testing-log.md`](docs/live-testing-log.md). Backend endpoints,
resources, and CDK validation are described in [`infra/README.md`](infra/README.md);
the device build and MQTT contract are in [`firmware/README.md`](firmware/README.md).
