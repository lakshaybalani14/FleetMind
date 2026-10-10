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

Overall estimate: **about 70% of the agreed prototype scope is complete**. This
is a planning estimate, not a production-readiness rating. The base telemetry,
dashboard, and relay loop are working; the Isolation Forest service and its
SNS-driven automation integration are the largest remaining project milestone.
See [`docs/project-status.md`](docs/project-status.md) for the full handoff and
next steps.

| Area | Status |
| --- | --- |
| ESP32 firmware | User confirmed the live board test works with 2-second telemetry updates and immediate relay-status updates. |
| AWS IoT Core | Device connection and telemetry topic verified. `FleetMindTelemetryToLambda` routes `fleetmind/+/telemetry` to the ingestion Lambda. |
| Storage and backend | Live telemetry has been verified through Lambda, DynamoDB, and S3. |
| Authentication and APIs | Cognito-authenticated HTTP API and API Gateway WebSocket dashboard flow are configured and working. |
| Dashboard and relay control | Live readings/status and manual relay ON/OFF have been verified on the board. Synthetic telemetry also verified automatic threshold ON and OFF with device acknowledgement. MQ-2 is a relative prototype level, not CO ppm; automatic demo mode remains opt-in. |
| Dashboard alerts and analytics | Local UI source includes a full-screen prototype threshold/anomaly warning, alert markers, sensor-rich live logs, log filters, and analysis of the latest 50 readings. Production build passes; final live retest of multi-node/offline alert behavior is pending. This does not add an ML model or a certified safety alarm. |
| Infrastructure source | CDK source is in `infra/`; the current AWS resources were configured manually, so review differences before any CDK deployment. |
| Live-test follow-up | User confirmed online/offline status, live readings, moving chart, manual relay, and synthetic threshold ON/OFF with device acknowledgement. AWS scan confirms the latest MQTT parsing/offline-gating Lambda package is deployed. Next: retest multi-node/offline alert behavior and begin the teammate-owned anomaly service. See [`docs/live-testing-log.md`](docs/live-testing-log.md). |

## Resume live testing

1. Optionally test threshold hysteresis-band and cooldown edge cases with
   synthetic telemetry and a harmless load, following
   [`docs/actuator-control.md`](docs/actuator-control.md). MQ-2 levels are not
   gas ppm or a CO safety measurement.
2. Keep certified CO alarms as the real life-safety protection; do not connect
   the prototype relay to safety-critical equipment.
3. Build anomaly detection as a separate teammate branch using
   [`docs/anomaly-service-plan.md`](docs/anomaly-service-plan.md).
   The agreed scope includes EC2 training, FastAPI `/score` in a Docker image
   pushed to ECR, K3s inference on EC2, Lambda score persistence, and SNS alerts
   when a high score triggers the acknowledged relay path. SQS is optional, not
   a current requirement.
4. Revisit latency measurements only if future live tests show noticeable lag
   or stale dashboard state.
5. Re-run the safe synthetic alert test on an online node and test that publishes
   are rejected while it is offline. Verify every node ID independently, the
   activity drawer, temperature chart spike, full-screen alert, and event log.
   The thresholds are demo values, not calibrated gas limits. See
   [`docs/live-testing-log.md`](docs/live-testing-log.md).

The hands-on setup, observed behavior, and repeatable test checklist are in
[`docs/live-testing-log.md`](docs/live-testing-log.md). Backend endpoints,
resources, and CDK validation are described in [`infra/README.md`](infra/README.md);
the device build and MQTT contract are in [`firmware/README.md`](firmware/README.md).
