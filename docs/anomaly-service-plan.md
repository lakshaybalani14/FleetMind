# FleetMind anomaly-service handoff

## Status and scope

Status: queued as the first teammate-owned feature workstream. Implement on a
separate Git branch and merge through a reviewed pull request. This document is
the starting contract, not authorization to change live AWS resources.

Agreed Phase 5/6 direction: collect normal telemetry from S3; train a
scikit-learn Isolation Forest offline, initially on EC2; expose inference as a
FastAPI `/score` service; package it in Docker and push a versioned image to
ECR; and run the container in K3s on a single EC2 node for the prototype. The
training EC2 and K3s inference EC2 may be the same or separate instances; decide
that before provisioning. ECR stores the image but does not run it.

The ingestion Lambda will call `/score` per reading initially (batching can be
considered if measured throughput requires it), persist the score/result, and
on a high score write an `AnomalyEvent`, publish an actuator command through
the existing IoT path, and publish an SNS alert. The device acknowledgement
must still close the control loop. Keep telemetry/WebSocket delivery live even
if model inference is unhealthy; fall back to the existing threshold behavior
and record inference failures. Measure the Phase 6 end-to-end target of under
5 seconds from anomaly reading to acknowledged physical action; it is a target
to verify, not a guarantee.

The project currently has one prototype node, an uncalibrated gas estimate, and
no trustworthy labeled dataset. A few hours or days of normal data are an
initial training input, not proof of model quality; evaluate coverage, false
alarms, and missed anomalies before using scores for actuation. Do not breathe
on the sensor, apply unsafe heat, or release gas as a test. Use controlled,
documented safe test readings for the prototype. Do not treat the uncalibrated
MQ-2 as a CO detector or life-safety device.

The status stream is already implemented separately: the dashboard consumes the
`node-status` WebSocket event for online/offline and relay state. It is not part
of the pending anomaly-service work.

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

## Phase 5 — Anomaly detection service

The teammate owns this work on a separate branch and opens a reviewed PR. The
original estimate is roughly 1–2 weeks; actual time depends on data quality and
evaluation findings.

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
4. Implement a small FastAPI inference application with a versioned JSON
   contract and `/score` endpoint. It loads the saved model and returns the
   score, normal/anomaly decision, model version, and reason/context features.
   Include a health endpoint and keep inference independent from the Next.js
   frontend.
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
8. Deploy the reviewed inference image to K3s on one EC2 node for the
   prototype. Document and secure the Lambda-to-FastAPI network path and
   service authentication, logging, health/restart behavior, and rollback to
   the previous image/model. Then the owner deploys and validates with
   controlled sample telemetry.
## Phase 6 — Close the automation loop

The original estimate is roughly one week after the scoring service is
reviewed. Complete this phase only after Phase 5's service contract and network
path are ready.

1. Add the response path: persist scored readings and a deduplicated
   `AnomalyEvent`, publish a high-score alert to an SNS topic, and request relay
   ON through the existing IoT command/acknowledgement flow. Avoid an alert and
   command on every repeated high-score sample; define a trigger/cooldown rule.
   The target is a measured sub-5-second reading-to-device-ack round trip.

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
- A high-scoring controlled test is stored as an `AnomalyEvent`, emits an SNS
  alert, and results in an acknowledged actuator action within the measured
  target; repeated samples are deduplicated/cooldown-limited.
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

For this agreed approach, pending AWS resources include an EC2 training
instance, an approved private S3 dataset/model-artifact location (the existing
telemetry-history bucket is separate until its access/retention is approved),
an ECR repository, an EC2 inference host running K3s, and an SNS anomaly-alert
topic with its approved subscriber(s). The training and inference EC2 roles
must be least-privilege and the service endpoint must be authenticated. SQS is
not required by the original Phase 5/6 flow; consider it only if asynchronous
inference buffering is needed, because it requires a result-return path and
changes when automation can act. Confirm the project spend limit and service
availability in `ap-southeast-2` before creating resources. Keep training data
and model artifacts on approved durable storage, and stop EC2 instances when
not needed.
