#!/usr/bin/env python3
"""Train a clearly provisional Isolation Forest on the public practice CSV.

This is a learning experiment, not a validated FleetMind detector. AQI_Level
== "Good" is used only as a proxy for a normal baseline; it is not ground truth.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURES = ["mq2", "temperature", "humidity"]
REQUIRED = ["timestamp_iso", *FEATURES, "AQI_Level"]
MODEL_VERSION = "practice-bangladesh-iforest-0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Cleaned practice CSV")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "output",
        help="Where local model and score files are written (ignored by Git)",
    )
    parser.add_argument("--train-fraction", type=float, default=0.8)
    parser.add_argument("--contamination", type=float, default=0.05)
    args = parser.parse_args()

    if not 0.5 <= args.train_fraction < 1:
        parser.error("--train-fraction must be at least 0.5 and less than 1")
    if not 0 < args.contamination <= 0.5:
        parser.error("--contamination must be greater than 0 and at most 0.5")

    data = pd.read_csv(args.input)
    missing = sorted(set(REQUIRED) - set(data.columns))
    if missing:
        parser.error(f"Input is missing required columns: {', '.join(missing)}")

    data["timestamp_iso"] = pd.to_datetime(data["timestamp_iso"], utc=True, errors="coerce")
    for feature in FEATURES:
        data[feature] = pd.to_numeric(data[feature], errors="coerce")

    # Remove unparseable rows and readings outside the documented MQ-2 ADC range.
    valid = data["timestamp_iso"].notna() & data[FEATURES].notna().all(axis=1)
    valid &= data["mq2"].between(0, 1023)
    invalid_rows = int((~valid).sum())
    data = data.loc[valid].sort_values("timestamp_iso", kind="stable").reset_index(drop=True)
    if len(data) < 100:
        parser.error("Need at least 100 valid rows for this practice experiment")

    split_at = int(len(data) * args.train_fraction)
    chronological_train = data.iloc[:split_at]
    holdout = data.iloc[split_at:].copy()

    # This is explicitly a proxy: AQI Good is not verified FleetMind normal data.
    baseline = chronological_train[
        chronological_train["AQI_Level"].astype(str).str.strip().str.casefold() == "good"
    ]
    if len(baseline) < 50:
        parser.error("Fewer than 50 'Good' proxy rows in the chronological training period")

    model = IsolationForest(
        n_estimators=200,
        contamination=args.contamination,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(baseline[FEATURES])

    # sklearn returns -1 for unusual and +1 for inliers. Negating its decision
    # function makes higher scores mean more unusual for easier interpretation.
    holdout["unusual_score"] = -model.decision_function(holdout[FEATURES])
    holdout["practice_prediction"] = model.predict(holdout[FEATURES])
    holdout["practice_prediction"] = holdout["practice_prediction"].map(
        {-1: "unusual", 1: "typical"}
    )
    holdout["label_note"] = "AQI_Level is context only; not an anomaly ground-truth label"

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "practice_model.joblib"
    scores_path = args.output_dir / "practice_holdout_scores.csv"
    metadata_path = args.output_dir / "practice_model_metadata.json"
    joblib.dump(model, model_path)
    holdout[["timestamp_iso", *FEATURES, "AQI_Level", "unusual_score", "practice_prediction", "label_note"]].to_csv(
        scores_path, index=False
    )

    metadata = {
        "model_version": MODEL_VERSION,
        "purpose": "offline learning exercise only; not approved for live FleetMind alerts",
        "dataset": args.input.name,
        "baseline_assumption": "AQI_Level == Good is a provisional proxy, not verified normal ground truth",
        "features_in_order": FEATURES,
        "units": {"mq2": "ADC counts (documented 0-1023)", "temperature": "degrees Celsius", "humidity": "percent relative humidity"},
        "timestamp_handling": "parsed as UTC and used for chronological sorting/splitting, not as a model feature",
        "train_fraction_chronological": args.train_fraction,
        "contamination_assumption": args.contamination,
        "rows_valid": len(data),
        "rows_excluded_as_invalid": invalid_rows,
        "baseline_proxy_rows": len(baseline),
        "holdout_rows": len(holdout),
        "holdout_start_utc": holdout["timestamp_iso"].iloc[0].isoformat(),
        "holdout_end_utc": holdout["timestamp_iso"].iloc[-1].isoformat(),
        "training_data_citation": "Shobuj et al. (2025), Air Quality in Bangladesh — Dhaka, Narayanganj, and Gazipur; Kaggle; CC BY 4.0 per dataset README.",
        "limitations": [
            "AQI categories are not reviewed anomaly labels.",
            "The source documentation has unresolved cadence and Gas_Index inconsistencies.",
            "This result does not validate performance on FleetMind hardware or authorize deployment.",
        ],
        "model_file": model_path.name,
        "holdout_scores_file": scores_path.name,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    unusual = int((holdout["practice_prediction"] == "unusual").sum())
    print(f"Practice model: {MODEL_VERSION}")
    print(f"Valid rows: {len(data)} (excluded invalid: {invalid_rows})")
    print(f"Provisional Good baseline rows: {len(baseline)}")
    print(f"Chronological holdout rows: {len(holdout)}")
    print(f"Flagged unusual in holdout: {unusual}")
    print(f"Saved local artifacts under: {args.output_dir.resolve()}")
    print("Reminder: these are practice scores, not validated FleetMind anomaly results.")


if __name__ == "__main__":
    main()
