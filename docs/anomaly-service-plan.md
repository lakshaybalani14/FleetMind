# FleetMind anomaly-service handoff

## Status and scope

Status: queued as the first teammate-owned feature workstream. Implement on a
separate Git branch and merge through a reviewed pull request. This document is
the starting contract, not authorization to change live AWS resources.

Agreed direction: train a scikit-learn Isolation Forest model on an EC2
development/training instance, save the fitted model, package the model and its
inference application into a Docker image, and push that image to ECR. ECR is a
container-image registry; pushing an image does not run it or make live
predictions. The runtime that will run the container and receive live readings
must be chosen before wiring it into the live telemetry path.

The project currently has one prototype node, an uncalibrated gas estimate, and
no trustworthy labeled dataset. The teammate can implement the training and
inference code and test it locally first. Do not deploy a live prediction
service until the data, evaluation, runtime, and access are reviewed.

The existing status stream remains a separate concern: the dashboard still needs
to consume the already-broadcast `node-status` WebSocket event.

## Existing telemetry available

The firmware currently sends these fields on
`fleetmind/<nodeId>/telemetry`:

| Field | Meaning / handling |
| --- | --- |
| `schemaVersion` | Payload schema version; currently `1`. |
| `nodeId` | Stable device identifier, e.g. `node-01`. |
| `sequence` | Per-node message sequence; use to detect gaps/duplicates. |
| `timestamp` | Device epoch seconds; can be `0` before NTP synchronization. |
| `uptimeMs` | Device uptime in milliseconds. |
| `temperatureC` | DHT22 temperature in Celsius. |
| `humidityPct` | DHT22 relative humidity percentage. |
| `gasAdc` | Raw MQ-2 ADC reading; preserve this for calibration and analysis. |
| `gasLevelEstimate` | MQ-2 relative 0–1000 prototype level; not calibrated ppm or CO ground truth. |
| `sensorValid` | Whether sensor readings passed firmware validity checks. |
| `isAnomaly` | Existing firmware rule flag; useful as a hint, not a verified label. |
| `relayOn` | Relay state reported by the device. |

Backend records also have a server-side receive time. Keep device timestamp and
server receive time distinct. Telemetry is edge-filtered and may be quiet for up
to 30 seconds, despite the firmware sampling locally every 2 seconds; account
for irregular intervals and missing readings.

## Dataset contract

Every stored/exported row should retain:

- `nodeId`, `sequence`, device `timestamp`, and server `receivedAt` in UTC;
- `temperatureC`, `humidityPct`, `gasAdc`, and `gasLevelEstimate` with units in
  column names;
- `sensorValid`, `relayOn`, `uptimeMs`, and relevant status/RSSI data where
  available;
- `schemaVersion`, plus an explicit data-quality flag/reason for invalid,
  missing, duplicate, or out-of-order readings.

For labeled evaluation data, add `anomalyLabel` (`normal`, `anomaly`, or
`unknown`), `anomalyType` (for example `gas_spike`, `temperature`,
`sensor_fault`, or `relay_related`), label source, confidence, and the start/end
of a controlled event. Record how the label was established. Do not call the
firmware's threshold flag ground truth without human or controlled-test review.

Start with existing telemetry for schema/fixture tests and collect clean normal
operation across expected environments, sensor warm-up, and relay states. Add
safe, controlled test events only with a documented ground-truth label. Keep
training/evaluation splits chronological (and preferably hold out full sessions
or nodes) so near-identical adjacent readings do not leak across the split.
Do not invent a minimum row count before measuring cadence, operating diversity,
and event coverage. If we later train a temporal model, increase data capture
frequency or buffer raw samples; the current 30-second edge-filtered history may
miss short spikes.

Do not place credentials, device certificates, Cognito tokens, or secrets in the
dataset or Git branch. For any later cloud dataset, use an approved private S3
prefix and least-privilege access; do not create a bucket or upload real data
until the owner reviews retention, access, and cost.

## Implementation procedure

1. Create a feature branch from the latest `main` (suggested name:
   `feat/anomaly-service`). Keep unrelated working-tree changes out of it.
2. Build a reproducible training script/notebook using Python and
   `sklearn.ensemble.IsolationForest`. It should read a versioned, cleaned
   dataset from S3 (or local fixtures during development), select numeric sensor
   features, handle invalid/missing sensor samples, train the model, and save the
   fitted model with `joblib` plus a metadata file describing feature order,
   units, preprocessing, contamination/threshold settings, and model version.
3. Evaluate on a chronological holdout set. Since Isolation Forest is
   unsupervised, labels are not required to fit it, but reviewed labels are
   needed to measure false alarms and missed anomalies and choose a useful
   threshold. Add unit tests for preprocessing, predictions, invalid sensors,
   missing fields, and model load/save round trips.
4. Implement a small inference application with a versioned JSON input/output
   contract. It loads the saved model and returns the score, normal/anomaly
   decision, model version, and reason/context features. Keep this detector
   independent from the Next.js frontend.
5. Add a Dockerfile with pinned Python/package versions and a health check or
   simple local smoke-test command. Include the inference app and the intended
   model artifact in the image, or document a versioned model download step if
   keeping model files outside the image. Build and test locally before pushing.
6. Push a tagged image to an ECR repository in `ap-southeast-2`. Do not use
   `latest` as the only model/image identifier; record the immutable image digest
   and model version. Enable image scanning if available.
7. Open a pull request with training/evaluation results, sample predictions,
   image build instructions, model artifact size, known limitations, and no live
   AWS deployment. The owner reviews/merges it.
8. Before live predictions, choose where the ECR image runs (for example, a
   Docker container on EC2) and how the ingestion backend can send it readings.
   Document the network path and authentication between services, logging,
   health/restart behavior, and how to roll back to the previous image/model.
   Then the owner deploys and validates with controlled sample telemetry.

The eventual anomaly event sent to the dashboard can look like:

```json
{
  "type": "anomaly",
  "eventId": "stable-event-id",
  "nodeId": "node-01",
  "timestamp": "2026-10-09T16:27:44.577Z",
  "detectorVersion": "isolation-forest-v1",
  "score": 0.91,
  "severity": "warning",
  "reasons": ["gas_reading_above_node_baseline"]
}
```

Do not alter the original measured sensor values. De-duplicate repeated
anomaly events and include feature contributions/context where possible; an
Isolation Forest score alone does not explain the physical cause.

## Acceptance criteria

- Training is reproducible and inference uses the exact feature order and
  preprocessing recorded with the model.
- Invalid sensor data is identified as data quality/fault, not silently scored
  as a physical environmental anomaly.
- The model and Docker image are versioned together, with an immutable ECR
  digest and a documented rollback target.
- The event includes severity, score, context/reason codes, node/time identifiers, and
  de-duplication behavior; repeat readings do not create an alert storm.
- Training/evaluation and inference tests pass; no credentials, generated ZIPs,
  or console-created resource changes are included in the feature branch.

## AWS collaboration and later ML path

Git branches control source code; they do not isolate shared AWS resources. The
teammate should develop and test locally first. Invite her through AWS Settings
→ Team and share the FleetMind project using the minimum access available that
still supports the agreed work. She should sign in with her own AWS Builder ID;
never share the owner's sign-in. She does not need a manually created IAM user
for console access. Give her access to the approved training-data location and
ECR repository only as needed. Do not deploy from her branch or let it change
live resources before pull-request review.

For this agreed approach, AWS resources likely include an EC2 training instance,
a private S3 dataset/model-artifact location, and an ECR repository. The
live-inference runtime and connection to the ingestion backend are still an
explicit design decision. Confirm the project spend limit and service
availability in `ap-southeast-2` before creating resources. Keep EC2 storage
temporary data on durable S3/EBS as appropriate; do not leave a training
instance running when it is not needed.
