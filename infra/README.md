# FleetMind cloud backend

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

1. Review the synthesized infrastructure and cost footprint, then explicitly approve deployment.
2. Deploy to the selected Region and create the first Cognito dashboard user.
3. Create a verified Cognito dashboard user and set the frontend environment values from stack outputs.
4. Test the WebSocket stream with the ESP32 publishing valid JSON to `fleetmind/node-01/telemetry`.
5. Build and deploy the anomaly-detection service and connect its result to stored events.
6. Add a controlled automation/command workflow and alarms, then choose frontend hosting (Amplify or CloudFront/S3).

Firmware Thing/certificate provisioning, IoT Core shadows, downlink automation, anomaly detection, and frontend hosting remain separate follow-up work.
