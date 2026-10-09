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
| ESP32 firmware | Built and uploaded for the live `node-01` test. It samples every 2 seconds and edge-filters MQTT telemetry. |
| AWS IoT Core | Device connection and telemetry topic verified. `FleetMindTelemetryToLambda` routes `fleetmind/+/telemetry` to the ingestion Lambda. |
| Storage and backend | Live telemetry has been verified through Lambda, DynamoDB, and S3. |
| Authentication and APIs | Cognito-authenticated HTTP API and API Gateway WebSocket dashboard flow are configured and working. |
| Dashboard | Connected to real API data; live WebSocket updates now work after correcting the Lambda role's `execute-api:ManageConnections` resource ARN. |
| Infrastructure source | CDK source is in `infra/`; the current AWS resources were configured manually, so review differences before any CDK deployment. |
| Live-test follow-up | The 15-second status/LWT topic now reaches Lambda, DynamoDB, and the WebSocket broadcaster. The dashboard still needs to consume `node-status` frames immediately; telemetry can wait up to 30 seconds during steady readings. See [`docs/live-testing-log.md`](docs/live-testing-log.md). |

## Resume live testing

1. Update the dashboard WebSocket handler to consume `node-status` frames and
   show online/offline and stale actuator state without a reload.
2. Test online/offline/reconnect status transitions; then repeat with the ESP32
   connected when available.
3. Build anomaly detection as a separate teammate branch using
   [`docs/anomaly-service-plan.md`](docs/anomaly-service-plan.md).
4. Later, tune the firmware's maximum quiet telemetry interval if more frequent
   chart points are desired, while keeping the sensor-change filter.

The hands-on setup, observed behavior, and repeatable test checklist are in
[`docs/live-testing-log.md`](docs/live-testing-log.md). Backend endpoints,
resources, and CDK validation are described in [`infra/README.md`](infra/README.md);
the device build and MQTT contract are in [`firmware/README.md`](firmware/README.md).
