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

The teammate export is not used for training: its nine `node-sim` readings are too few and appear simulated, while its 41 `node-01` records have no raw `gasAdc`. It may be used later as a pipeline fixture after the teammate confirms its origin.

This exercise must not be used for live alerts. FleetMind deployment requires review of the source data, sensor-specific readings, validation, and the inference/runtime design described in `docs/anomaly-service-plan.md`.
