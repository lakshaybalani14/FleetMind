# FleetMind anomaly model: practice experiment

This folder contains an offline learning exercise using the downloaded Bangladesh air-quality CSV. It does not connect to AWS, MQTT, the dashboard, or a live FleetMind sensor.

The script uses only `mq2`, `temperature`, and `humidity` as model inputs. It sorts by timestamp and holds out the latest 20% of rows. For the initial experiment only, rows marked `AQI_Level == Good` in the earlier portion are used as a *provisional normal baseline*. That is an assumption for practice: AQI labels are not verified gas-anomaly labels.

From the FleetMind repository root, run:

```bash
python3 ml/anomaly/practice/train_practice_model.py \
  --input /Users/amandeep/Downloads/FleetMind-data-practice/practice_clean.csv
```

The script writes `practice_model.joblib`, `practice_holdout_scores.csv`, and `practice_model_metadata.json` to `ml/anomaly/practice/output/`. That output folder is Git-ignored; the downloaded dataset and model artifacts should not be committed.

In the score file, a higher `unusual_score` means the reading is more unusual relative to the provisional baseline. `practice_prediction` is the model's decision under the configured 5% contamination assumption. Neither field confirms a dangerous gas event.

The earlier `results (1).csv` teammate export is not used for training: its nine `node-sim` readings are too few and appear simulated, while its 41 `node-01` records have no raw `gasAdc`. It may be used later as a pipeline fixture after the teammate confirms its origin.

This exercise must not be used for live alerts. FleetMind deployment requires review of the source data, sensor-specific readings, validation, and the inference/runtime design described in `docs/anomaly-service-plan.md`.

## UrbanIoT labeled-data practice model

The downloaded UrbanIoT archive has a `sensor_data.csv` file with sensor
features and an `anomaly_label` column. This is the most useful of the public
practice datasets for trying a labeled anomaly classifier. Train it from the
repository root with:

```bash
python3 ml/anomaly/practice/train_urbaniot_classifier.py \
  --input-zip "/Users/amandeep/Downloads/archive (3).zip" \
  --feature-set all
```

The script uses the available temperature, humidity, gas level, vibration,
noise, motion, and location fields. Missing values are median-imputed for
numeric fields; sensor columns that are absent are skipped. It trains a
Random Forest on the earlier 75% of timestamped rows and evaluates on the last
25%. It uses only `sensor_data.csv` and its `anomaly_label`; it does not use
the separate image metadata labels.

The all-feature model, later-row predictions, and metrics are saved under the
Git-ignored `output/` folder with the `urbaniot_all_sensors_` filename prefix.
The run used 750 training rows and 250 holdout rows. It got 22 of 24 labeled
holdout anomalies right (recall 0.917), with 2 false alarms among 226 normal
rows (precision 0.917 for the anomaly class).

To train using only temperature and humidity, use:

```bash
python3 ml/anomaly/practice/train_urbaniot_classifier.py \
  --input-zip "/Users/amandeep/Downloads/archive (3).zip" \
  --feature-set temperature_humidity
```

That model's holdout recall was only 1 of 24 anomalies (0.042); it missed 23.
So temperature and humidity alone do not capture most anomaly labels in this
dataset. Its outputs use the `urbaniot_temperature_humidity_` filename prefix.
The all-feature model also doesn't transfer directly to FleetMind because its
gas field isn't a documented match to FleetMind's raw MQ ADC. These are
practice models, not live FleetMind alert models.

## Trial model from FleetMind S3 telemetry

The teammate-provided `fleetmind_s3_telemetry.csv` is a more relevant source
for FleetMind than the public practice dataset. To train a local trial model,
run this from the repository root:

```bash
python3 ml/anomaly/practice/train_fleetmind_trial.py \
  --input /Users/amandeep/Downloads/fleetmind_s3_telemetry.csv
```

The script uses only `node-01` rows with `sensorValid == True`, valid timestamps,
and usable `gasAdc`, temperature, and humidity values. It excludes `node-sim`
and rows with missing sensor fields, sorts by timestamp, trains on the earlier
80%, and scores the later 20%. It does not use `anomalyLabel` or
`existingIsAnomaly` as truth because the source labels are unreviewed/unknown.

For the supplied CSV, this produced 1,582 usable rows: 1,265 for training and
317 for chronological holdout scoring. The trial flagged 20 holdout readings
as unusual; the highest score was a 61°C reading. These are candidates for
human review, not confirmed anomalies or danger warnings. The 2% contamination
setting is a threshold assumption, not a measured FleetMind anomaly rate.

The model, cleaned candidate-baseline rows, scores, and metadata are saved under
`ml/anomaly/practice/output/`, which is Git-ignored. The CSV and model artifacts
are not committed. This is offline only and is not connected to MQTT, Lambda,
AWS, or the dashboard. Review the flags and obtain confirmed labels before
using the model for live alerts.

## Synthetic FleetMind-shaped demo

To see the train-then-predict flow without waiting for physical ESP32 readings,
run this separate simulation from the repository root:

```bash
python3 ml/anomaly/practice/synthetic_fleetmind_demo.py
```

It generates fictional normal readings (`gasAdc`, `temperatureC`, and
`humidityPct`), trains an Isolation Forest on those normal readings, then
scores two one-reading examples: one near the fictional baseline and one with
a deliberately large MQ ADC value. It prints the Isolation Forest result,
unusualness score, and a demo alert when the model labels the example unusual.
Invalid sensor data is treated as a `sensor_issue`, not as a gas anomaly.

Every value is synthetic. The model's baseline and 10% contamination setting
are demonstration parameters. The contamination setting is not a measured
anomaly rate or calibrated gas threshold. None are measured sensor
behavior or gas safety thresholds. A successful demo shows that the software
can train and score a reading; it does not validate detection on FleetMind
hardware. Replace the generated training data with labeled/recorded FleetMind
readings and evaluate it before any live integration.

## Combined FleetMind + UrbanIoT prototype

This experiment fits two components and keeps their outputs visible:

- An Isolation Forest learns a baseline from FleetMind `node-01` readings
  where `sensorValid` is true, using `gasAdc`, `temperature`, and `humidity`.
- A Random Forest learns UrbanIoT's `anomaly_label` using only `temp` and
  `humidity`. It does not use UrbanIoT gas, vibration, noise, motion, or
  location fields.

Train both components and score the chronological FleetMind holdout:

```bash
python3 ml/anomaly/practice/train_hybrid_fleetmind.py \
  --fleet-csv "/Users/amandeep/Downloads/fleetmind_s3_telemetry.csv" \
  --urban-zip "/Users/amandeep/Downloads/archive (3).zip"
```

The run saved a joblib model bundle, FleetMind holdout scores, UrbanIoT
holdout predictions, and metrics under `output/`. For the supplied data, the
FleetMind component flagged 20 of 317 later valid readings as unusual. The
UrbanIoT component caught 1 of 24 labeled anomalies on its own holdout and
flagged 0 FleetMind holdout readings at its default probability threshold.
The combined candidate decision is true if either component flags, so in
this run its FleetMind results match the FleetMind baseline alone. FleetMind
labels are unknown, so the 20 flags cannot be called correct or incorrect.

Score a new FleetMind reading with the saved model:

```bash
python3 ml/anomaly/practice/score_hybrid_fleetmind.py \
  --reading-json '{"temperature":25.1,"humidity":65.6,"gasAdc":367,"sensorValid":true}'
```

The input uses only FleetMind fields. A valid reading returns `prediction` as
`normal` or `anomaly`, along with each component's signal, score, and model
version. Invalid sensor readings return `sensor_issue` and are not scored as
environmental anomalies. This remains an offline prototype: the UrbanIoT
temperature/humidity classifier performed poorly on labeled UrbanIoT holdout
data, and there are no reviewed FleetMind anomaly labels. Do not use it for
live alerts without collecting and reviewing FleetMind examples first.
