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
| Live-test follow-up | Telemetry can wait up to 30 seconds during steady readings; dashboard offline status uses a 90-second telemetry timeout. The device's 15-second status/LWT topic is not yet routed through the backend. See [`docs/live-testing-log.md`](docs/live-testing-log.md). |

## Resume live testing

1. Reduce the firmware's maximum quiet telemetry interval if more frequent chart
   points are desired, while keeping the sensor-change filter.
2. Add an AWS IoT rule for `fleetmind/+/status` and update Lambda/frontend code to
   process online/offline and relay-state messages.
3. Test sensor updates, disconnects, reconnects, and relay state while checking
   CloudWatch delivery logs and browser WebSocket frames.

The hands-on setup, observed behavior, and repeatable test checklist are in
[`docs/live-testing-log.md`](docs/live-testing-log.md). Backend endpoints,
resources, and CDK validation are described in [`infra/README.md`](infra/README.md);
the device build and MQTT contract are in [`firmware/README.md`](firmware/README.md).
