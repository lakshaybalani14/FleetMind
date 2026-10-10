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

| Area | Status |
| --- | --- |
| ESP32 firmware | User confirmed the live board test works with 2-second telemetry updates and immediate relay-status updates. |
| AWS IoT Core | Device connection and telemetry topic verified. `FleetMindTelemetryToLambda` routes `fleetmind/+/telemetry` to the ingestion Lambda. |
| Storage and backend | Live telemetry has been verified through Lambda, DynamoDB, and S3. |
| Authentication and APIs | Cognito-authenticated HTTP API and API Gateway WebSocket dashboard flow are configured and working. |
| Dashboard and relay control | Live readings/status work; the authenticated relay routes and updated Lambda are configured in AWS. Manual board round-trip remains to be tested; automatic mode is disabled pending MQ-2 calibration. |
| Infrastructure source | CDK source is in `infra/`; the current AWS resources were configured manually, so review differences before any CDK deployment. |
| Live-test follow-up | User confirmed online/offline status, live readings, and the moving chart work without manual refresh. Next: continue with anomaly detection. See [`docs/live-testing-log.md`](docs/live-testing-log.md). |

## Resume live testing

1. Reconnect the board and test the bidirectional manual relay flow using
   [`docs/actuator-control.md`](docs/actuator-control.md). Automation remains
   disabled until gas sensor thresholds are calibrated and explicitly set.
2. Calibrate the gas sensor, then verify threshold automation with safe test
   readings before enabling it.
3. Build anomaly detection as a separate teammate branch using
   [`docs/anomaly-service-plan.md`](docs/anomaly-service-plan.md).
4. Revisit latency measurements only if future live tests show noticeable lag
   or stale dashboard state.

The hands-on setup, observed behavior, and repeatable test checklist are in
[`docs/live-testing-log.md`](docs/live-testing-log.md). Backend endpoints,
resources, and CDK validation are described in [`infra/README.md`](infra/README.md);
the device build and MQTT contract are in [`firmware/README.md`](firmware/README.md).
