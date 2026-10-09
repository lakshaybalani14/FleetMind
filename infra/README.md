# FleetMind cloud backend

## Current live-test status

The HTTP API, Cognito authentication, WebSocket API, telemetry Lambda, DynamoDB,
S3, and AWS IoT telemetry rule have been configured manually in
`ap-southeast-2`. The ESP32-to-storage path and authenticated dashboard stream
have been exercised. A `403 AccessDeniedException` on WebSocket callback delivery
was fixed by scoping the Lambda role's `execute-api:ManageConnections` permission
to the WebSocket API's `POST/@connections/*` connection path.

The CDK stack below documents the intended infrastructure as code; it is not
confirmed to be the source of the existing console-created resources. In
particular, compare the synthesized template with the live resources before
deploying, so CDK does not create duplicates or replace manually configured
resources.

This CDK stack provides the authenticated dashboard API and a real-time telemetry stream. It adds an AWS IoT Core rule for the existing firmware topic `fleetmind/<nodeId>/telemetry`; it does not create or change Things, certificates, or device policies.

## What this stack creates

- API Gateway HTTP API with Cognito JWT authorization on every route.
- API Gateway WebSocket API with a one-use Cognito-authenticated connection ticket.
- Cognito user pool, public web app client (no client secret), and Managed Login v2 domain with default branding.
- One on-demand DynamoDB table for current node state, telemetry history, and the recent event log.
- One on-demand DynamoDB table for WebSocket connection IDs and expiring tickets.
- A private, encrypted S3 bucket for historical telemetry JSON objects.
- Node.js 22 Lambda handlers for API requests, IoT telemetry ingestion, WebSocket authorization, and connection lifecycle.
- An AWS IoT Core rule routing `fleetmind/+/telemetry` messages to the ingestion Lambda.
- CloudWatch log groups with 30-day retention.

All regional resources are pinned to `ap-southeast-2`. The Managed Login app client uses authorization code (not implicit) with a local callback at `http://localhost:3000/auth/callback`; the frontend still needs to implement PKCE. The default API browser origin is `http://localhost:3000`; set `-c appOrigin=https://your-dashboard.example` on a later synth/deploy for the deployed frontend origin.

## Access patterns and data keys

| Request | DynamoDB access | Item key |
| --- | --- | --- |
| List fleet nodes | Query, no table scan | `PK=FLEET`, `SK begins_with NODE#` |
| Recent telemetry for one node | Query by node partition | `PK=NODE#<nodeId>`, `SK begins_with TELEMETRY#` |
| Recent fleet event log | Query, no table scan | `PK=FLEET`, `SK begins_with EVENT#` |
| Ingest telemetry | Put telemetry + event, conditionally update latest state | Same keys as above |

Telemetry and event items receive a 30-day DynamoDB TTL; the S3 history objects are retained independently. The S3 object key is date- and node-partitioned and content-addressed by the node, timestamp, and event ID, so retrying the same event does not create a second object. This prototype stores one small object per event; for a higher-throughput fleet, replace direct S3 puts with a buffering delivery path such as Kinesis Data Firehose.

### HTTP API routes

All routes require a Cognito JWT in `Authorization: Bearer <token>`.

- `GET /nodes`
- `GET /telemetry?nodeId=node-01&limit=50`
- `POST /telemetry` with `eventId`, `nodeId`, ISO `timestamp`, `temperature`, `humidity`, and `gasLevel`; optional `isAnomaly` and `actuatorState` fields are preserved.
- `GET /logs?limit=50`
- `POST /ws-ticket` issues a random, single-use ticket with a 60-second expiry. The WebSocket `$connect` Lambda authorizer atomically consumes it. The Cognito ID token is sent only to this HTTPS endpoint, not placed in the WebSocket URL.

`POST /telemetry` remains a Cognito-authenticated dashboard/test ingestion endpoint. Device messages arrive through the IoT Core rule, authenticated with the device certificate and IoT policy—not Cognito.

### WebSocket flow

1. The dashboard signs in through Cognito Managed Login using OAuth authorization code + PKCE.
2. It calls `POST /ws-ticket` with the Cognito ID token. The API Gateway HTTP JWT authorizer verifies the token before the Lambda issues a 60-second ticket.
3. The browser opens the WebSocket URL with that ticket. A WebSocket Lambda authorizer consumes the ticket once, then `$connect` records the connection ID. `$disconnect` removes it.
4. The IoT rule sends device telemetry to the ingestion Lambda. That Lambda writes DynamoDB and S3, then posts the reading to connected dashboard clients. Expired connection IDs are removed when API Gateway reports them gone.

The frontend reads configuration from the root `.env.local` using `.env.local.example` as a template. Use the deployed stack outputs for the HTTP API URL, WebSocket URL, Cognito app client ID, and managed-login domain.

## Local validation

From this directory:

```powershell
npm run typecheck
npm run synth
```

Synthesis is local and does not create AWS resources. To inspect the proposed infrastructure changes before deployment:

```powershell
npx cdk diff --profile codex-aws
```

No stack is deployed by these steps. Before deployment, review the synthesized resource set and current AWS spend limit. The DynamoDB table, Cognito pool, and S3 history bucket are retained on stack deletion; the DynamoDB table also has deletion protection and point-in-time recovery enabled.

## Remaining cloud work

1. Update the dashboard so online/offline and relay status change immediately
   from the existing `node-status` WebSocket event; show old actuator values as
   stale/unknown while offline.
2. Build and review the Isolation Forest training/inference image as a separate
   feature branch, following
   [`../docs/anomaly-service-plan.md`](../docs/anomaly-service-plan.md). The
   agreed direction uses EC2 for training and ECR for the Docker image; choose
   the live inference runtime and network path before connecting it to ingestion.
3. Continue end-to-end testing as the anomaly service is integrated; revisit
   latency measurements if live behavior regresses. See
   [`../docs/live-testing-log.md`](../docs/live-testing-log.md).
4. After the live path is stable, continue with controlled command/automation
   flows, alarms, and frontend hosting.

The device Thing/certificate and firmware shadow/downlink hooks exist for the
current prototype; a complete dashboard command workflow is still future work.
Production-grade fleet provisioning, robust offline buffering, anomaly
detection, automation hardening, and frontend hosting also remain future work.
