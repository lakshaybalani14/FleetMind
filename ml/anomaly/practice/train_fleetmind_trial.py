#!/usr/bin/env python3
"""Train and score a provisional FleetMind Isolation Forest from S3 telemetry.

The CSV labels are unknown. This script treats valid node-01 rows as a
candidate baseline and reports unsupervised scores; it does not measure
accuracy or establish that a flagged reading is dangerous.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURES = ["gasAdc", "temperature", "humidity"]
REQUIRED = ["timestamp", "nodeId", "sensorValid", *FEATURES]
MODEL_VERSION = "fleetmind-node01-iforest-trial-0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="FleetMind S3 telemetry CSV")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "output",
        help="Local output directory (Git-ignored)",
    )
    parser.add_argument("--train-fraction", type=float, default=0.8)
    parser.add_argument("--contamination", type=float, default=0.02)
    args = parser.parse_args()

    if not 0.5 <= args.train_fraction < 1:
        parser.error("--train-fraction must be at least 0.5 and less than 1")
    if not 0 < args.contamination <= 0.5:
        parser.error("--contamination must be greater than 0 and at most 0.5")

    data = pd.read_csv(args.input, dtype={"nodeId": "string", "sensorValid": "string"})
    missing = sorted(set(REQUIRED) - set(data.columns))
    if missing:
        parser.error(f"Input is missing required columns: {', '.join(missing)}")

    data["timestamp"] = pd.to_datetime(data["timestamp"], utc=True, errors="coerce")
    for feature in FEATURES:
        data[feature] = pd.to_numeric(data[feature], errors="coerce")

    # Do not mix the nine node-sim records with the actual node-01 baseline.
    candidate = data.loc[
        (data["nodeId"].str.strip() == "node-01")
        & (data["sensorValid"].str.strip().str.casefold() == "true")
    ].copy()
    valid = candidate["timestamp"].notna() & candidate[FEATURES].notna().all(axis=1)
    valid &= candidate["gasAdc"].between(0, 4095)
    valid &= candidate["humidity"].between(0, 100)
    valid &= candidate["temperature"].between(-40, 85)
    clean = candidate.loc[valid].sort_values("timestamp", kind="stable").reset_index(drop=True)

    if len(clean) < 100:
        parser.error(f"Need at least 100 usable node-01 readings; found {len(clean)}")

    # Labels remain unknown. This is an unsupervised trial: the model assumes
    # the chosen baseline is mostly ordinary; no anomaly labels are used.
    split_at = int(len(clean) * args.train_fraction)
    training = clean.iloc[:split_at]
    holdout = clean.iloc[split_at:].copy()
    model = IsolationForest(
        n_estimators=300,
        contamination=args.contamination,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(training[FEATURES])

    holdout["unusual_score"] = -model.decision_function(holdout[FEATURES])
    holdout["trial_prediction"] = pd.Series(model.predict(holdout[FEATURES]), index=holdout.index).map(
        {-1: "unusual", 1: "typical"}
    )
    holdout["label_status"] = "unknown; prediction is not ground truth"

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "fleetmind_trial_model.joblib"
    clean_path = args.output_dir / "fleetmind_node01_valid_clean.csv"
    scores_path = args.output_dir / "fleetmind_trial_holdout_scores.csv"
    metadata_path = args.output_dir / "fleetmind_trial_model_metadata.json"
    joblib.dump(model, model_path)
    clean.to_csv(clean_path, index=False)
    holdout[
        ["timestamp", "nodeId", *FEATURES, "existingIsAnomaly", "anomalyLabel",
         "unusual_score", "trial_prediction", "label_status"]
    ].to_csv(scores_path, index=False)

    metadata = {
        "model_version": MODEL_VERSION,
        "purpose": "provisional offline FleetMind trial; not approved for live alerts",
        "input_filename": args.input.name,
        "filters": [
            "nodeId == node-01",
            "sensorValid == True",
            "timestamp and model features parse successfully",
            "gasAdc in 0..4095, humidity in 0..100, temperature in -40..85 C",
        ],
        "features_in_order": FEATURES,
        "timestamp_handling": "UTC parsed and used for chronological split; not a model feature",
        "training_assumption": "selected valid node-01 data is a candidate baseline and is mostly normal; not verified",
        "labels_used_for_training": False,
        "train_fraction_chronological": args.train_fraction,
        "contamination_assumption": args.contamination,
        "usable_rows": len(clean),
        "training_rows": len(training),
        "holdout_rows": len(holdout),
        "excluded_after_node_valid_filter": int(len(candidate) - len(clean)),
        "holdout_start_utc": holdout["timestamp"].iloc[0].isoformat(),
        "holdout_end_utc": holdout["timestamp"].iloc[-1].isoformat(),
        "limitations": [
            "All source anomalyLabel values are unknown; scores cannot be evaluated as confirmed accuracy.",
            "existingIsAnomaly is retained only for inspection and is not treated as reviewed ground truth.",
            "A model flag means unusual relative to the chosen baseline, not a gas identification or safety verdict.",
            "This model has not been connected to MQTT, Lambda, AWS, or the dashboard.",
        ],
        "model_file": model_path.name,
        "clean_data_file": clean_path.name,
        "holdout_scores_file": scores_path.name,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    unusual = int((holdout["trial_prediction"] == "unusual").sum())
    print(f"Model: {MODEL_VERSION}")
    print("Source labels: all unknown; training is unsupervised.")
    print(f"Usable node-01 sensor-valid rows: {len(clean)}")
    print(f"Training rows: {len(training)}; chronological holdout rows: {len(holdout)}")
    print(f"Holdout readings flagged unusual: {unusual}/{len(holdout)}")
    print(f"Saved model, cleaned rows, scores, and metadata in: {args.output_dir.resolve()}")
    print("Reminder: unusual means different from the candidate baseline, not confirmed abnormal.")


if __name__ == "__main__":
    main()
