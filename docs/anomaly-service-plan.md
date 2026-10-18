# FleetMind anomaly detection — offline experiment and future scope

Last reviewed: **2026-10-18**.

## Current decision

The anomaly prototype is in the repository, but it is **not connected** to live
AWS ingestion, the dashboard, SNS, or relay control. Keep it offline.

The user reviewed flagged FleetMind holdout readings: **19 readings were real,
ordinary room readings from the board, and one 61 °C reading was a deliberately
sent synthetic payload.** The detector flagged these readings as unusual. That
means it would raise too many false alarms for the observed normal environment.
The synthetic reading verifies that a large value can score as unusual; it
does not prove the detector can recognize real hazards.

The project uses deterministic prototype thresholds for demo alerts. Bedrock
may explain an alert after those existing rules fire; it does not classify the
reading or control the relay. The separate EC2 health monitor, CloudWatch
alarms, SNS notifications, and Session Manager are operational device-health
features, not an anomaly model. See [device-health monitor](cloud-health-monitor-plan.md).

The previous EC2 model-training, ECR, K3s inference, Lambda scoring, ML SNS,
and model-triggered relay plan is **deferred**. It is not an active deployment
task. Do not present the experiment as a validated production detector.

## Experiments in `ml/anomaly/practice/`

The scripts are local/offline exercises:

- `train_fleetmind_trial.py` — trains an Isolation Forest from valid FleetMind
  node readings and scores a later chronological holdout.
- `train_hybrid_fleetmind.py` — compares a FleetMind baseline with an UrbanIoT
  classifier experiment.
- `score_hybrid_fleetmind.py` — scores a single FleetMind-shaped reading using
  a locally saved model bundle.
- `train_urbaniot_classifier.py` — explores a public labeled dataset; its gas
  fields and labels are not FleetMind ground truth.
- `synthetic_fleetmind_demo.py` — demonstrates software behavior using fully
  fictional training and test values.

Model files, reports, and score output are written to a local ignored `output/`
folder. Do not commit credentials, sensor certificates, private datasets, or
unreviewed model outputs.

## Data needed before reconsidering deployment

For every reading, retain at least:

| Field | Why it matters |
| --- | --- |
| `timestamp`, `receivedAt` | Device time and server receipt time help detect stale, out-of-order, or delayed records. |
| `nodeId`, `sequence` | Separates devices and reveals gaps/duplicates/reboots. |
| `gasAdc`, `gasLevelEstimate` | Preserves the raw ADC count and the current relative UI scale. |
| `temperatureC`, `humidityPct` | Records the environmental context. |
| `sensorValid` | Keeps sensor failures separate from environmental anomalies. |
| `relayOn`, `uptimeMs`, `schemaVersion` | Adds operating context and firmware/data-contract version. |
| `anomalyLabel`, `anomalyType`, `labelSource` | Records only reviewed labels and how they were established. |

The original S3 telemetry helps establish normal operating ranges and test
parsing/storage. It does not automatically contain trustworthy labels. Mark
synthetic MQTT events explicitly as synthetic; use safe, documented test
conditions and do not call injected MQTT values physical sensor measurements.
No gas release, smoke generation, or unsafe heating is an acceptable test.

Use chronological and preferably session- or node-held-out evaluation splits.
Review flagged readings with device logs or known controlled test events. A
small dataset can demonstrate training code but cannot establish useful false
alarm or missed-event rates. Do not choose contamination as if it were a
measured anomaly frequency.

## Entry criteria for future work

Before building or deploying another model, the team should have:

1. A reviewed collection of ordinary board readings across expected rooms,
   sensor warm-up, and relay states.
2. Safe, documented anomaly or sensor-fault examples with label source and
   confidence; unknown rows remain unknown.
3. A chronological holdout report with false-positive and false-negative
   counts, plus examples reviewed by a person.
4. A model interface and fallback plan that cannot delay telemetry delivery or
   interfere with threshold alerts and relay acknowledgement.
5. Explicit approval of any future AWS services, cost, access, and rollback
   design before creating training or inference infrastructure.

Until then, the current threshold alerts remain the project's live demo logic;
the model has no role in the live event workflow.
