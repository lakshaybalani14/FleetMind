# FleetMind cloud backend (IoT Core deferred)

This is the first deployable cloud slice. It deliberately does not create or change AWS IoT Core resources and does not touch ESP32 firmware.

## What this stack creates

- API Gateway HTTP API with Cognito JWT authorization on every route.
- Cognito user pool, public web app client (no client secret), and Managed Login v2 domain with default branding.
- One on-demand DynamoDB table for current node state, telemetry history, and the recent event log.
- A private, encrypted S3 bucket for historical telemetry JSON objects.
- One Node.js 22 Lambda handler with scoped access to that table and the `telemetry/*` S3 prefix.
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

### API routes

All routes require a Cognito JWT in `Authorization: Bearer <token>`.

- `GET /nodes`
- `GET /telemetry?nodeId=node-01&limit=50`
- `POST /telemetry` with `eventId`, `nodeId`, ISO `timestamp`, `temperature`, `humidity`, and `gasLevel`; optional `isAnomaly` and `actuatorState` fields are preserved.
- `GET /logs?limit=50`

`POST /telemetry` is currently an authenticated dashboard/test ingestion endpoint, not device authentication. A later IoT Core rule can route device messages into a dedicated ingestion path without exposing Cognito tokens to firmware.

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
3. Add the Next.js sign-in flow and replace simulated dashboard data with the API contract above.
4. Build and deploy the anomaly-detection service and connect its result to stored events.
5. Add a controlled automation/command workflow after the IoT Core decision is reopened.
6. Add alarms, deployment pipeline, and the frontend hosting choice (Amplify or CloudFront/S3).

Firmware, IoT Core rules/shadows, and device-to-cloud authentication are intentionally deferred.
