#!/usr/bin/env python3
"""Train and locally score a FleetMind + UrbanIoT two-signal prototype.

FleetMind's valid node-01 readings define an Isolation Forest baseline over
gasAdc, temperature, and humidity. UrbanIoT's labels train a supervised
Random Forest using only temperature and humidity. The two signals remain
visible in inference output; the combined candidate flag is their OR.
"""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import Pipeline

FLEET_FEATURES = ["gasAdc", "temperature", "humidity"]
URBAN_FEATURES = ["temp", "humidity"]
MODEL_VERSION = "fleetmind-hybrid-prototype-0.2"
URBAN_MODEL_VERSION = "urbaniot-temp-humidity-rf-0.1"
URBAN_THRESHOLD = 0.5


def load_urban_csv(zip_path: Path) -> pd.DataFrame:
    with zipfile.ZipFile(zip_path) as archive:
        matches = [name for name in archive.namelist() if name.rsplit("/", 1)[-1] == "sensor_data.csv"]
        if len(matches) != 1:
            raise ValueError(f"Expected one sensor_data.csv in ZIP; found {len(matches)}")
        with archive.open(matches[0]) as source:
            return pd.read_csv(io.BytesIO(source.read()))


def prepare_fleetmind(path: Path) -> pd.DataFrame:
    data = pd.read_csv(path, dtype={"nodeId": "string", "sensorValid": "string"})
    required = {"timestamp", "nodeId", "sensorValid", *FLEET_FEATURES}
    missing = sorted(required - set(data.columns))
    if missing:
        raise ValueError(f"FleetMind CSV missing columns: {', '.join(missing)}")
    data["timestamp"] = pd.to_datetime(data["timestamp"], utc=True, errors="coerce")
    for col in FLEET_FEATURES:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    candidate = data.loc[
        data.nodeId.str.strip().eq("node-01")
        & data.sensorValid.str.strip().str.casefold().eq("true")
    ].copy()
    good = candidate.timestamp.notna() & candidate[FLEET_FEATURES].notna().all(axis=1)
    good &= candidate.gasAdc.between(0, 4095)
    good &= candidate.humidity.between(0, 100)
    good &= candidate.temperature.between(-40, 85)
    clean = candidate.loc[good].sort_values("timestamp", kind="stable").reset_index(drop=True)
    if len(clean) < 100:
        raise ValueError(f"Need at least 100 valid FleetMind rows; found {len(clean)}")
    return clean


def prepare_urban(zip_path: Path) -> pd.DataFrame:
    data = load_urban_csv(zip_path)
    required = {"timestamp", "anomaly_label", *URBAN_FEATURES}
    missing = sorted(required - set(data.columns))
    if missing:
        raise ValueError(f"UrbanIoT sensor_data.csv missing columns: {', '.join(missing)}")
    data["timestamp"] = pd.to_datetime(data["timestamp"], utc=True, errors="coerce")
    for col in URBAN_FEATURES + ["anomaly_label"]:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    data = data.dropna(subset=["timestamp", "anomaly_label", *URBAN_FEATURES])
    data = data.loc[data.anomaly_label.isin([0, 1])].sort_values("timestamp", kind="stable").reset_index(drop=True)
    data["anomaly_label"] = data.anomaly_label.astype(int)
    if data.anomaly_label.nunique() != 2:
        raise ValueError("UrbanIoT data needs both normal (0) and anomaly (1) labels")
    return data


def fit_models(fleet: pd.DataFrame, urban: pd.DataFrame) -> tuple[Any, Any, pd.DataFrame, pd.DataFrame]:
    fleet_split = int(len(fleet) * 0.8)
    fleet_train = fleet.iloc[:fleet_split]
    fleet_holdout = fleet.iloc[fleet_split:].copy()
    if len(fleet_train) == 0 or len(fleet_holdout) == 0:
        raise ValueError("FleetMind data is too small for chronological split")
    fleet_model = IsolationForest(
        n_estimators=300,
        contamination=0.02,
        random_state=42,
        n_jobs=-1,
    )
    fleet_model.fit(fleet_train[FLEET_FEATURES])

    urban_split = int(len(urban) * 0.75)
    urban_train = urban.iloc[:urban_split]
    urban_holdout = urban.iloc[urban_split:].copy()
    if urban_train.anomaly_label.nunique() != 2 or urban_holdout.anomaly_label.nunique() != 2:
        raise ValueError("Both UrbanIoT chronological train and holdout sets need both labels")
    urban_model = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=400,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    urban_model.fit(urban_train[URBAN_FEATURES], urban_train.anomaly_label)
    urban_holdout["predicted_anomaly"] = urban_model.predict(urban_holdout[URBAN_FEATURES]).astype(int)
    urban_holdout["anomaly_probability"] = urban_model.predict_proba(urban_holdout[URBAN_FEATURES])[:, 1]

    fleet_holdout["fleet_baseline_score"] = -fleet_model.decision_function(fleet_holdout[FLEET_FEATURES])
    fleet_holdout["fleet_baseline_unusual"] = fleet_model.predict(fleet_holdout[FLEET_FEATURES]) == -1
    fleet_holdout["urbaniot_anomaly_probability"] = urban_model.predict_proba(
        fleet_holdout[["temperature", "humidity"]].rename(columns={"temperature": "temp"})
    )[:, 1]
    fleet_holdout["urbaniot_label_signal"] = fleet_holdout.urbaniot_anomaly_probability >= URBAN_THRESHOLD
    fleet_holdout["hybrid_anomaly_candidate"] = (
        fleet_holdout.fleet_baseline_unusual | fleet_holdout.urbaniot_label_signal
    )
    fleet_holdout["prediction"] = fleet_holdout.hybrid_anomaly_candidate.map(
        {True: "anomaly", False: "normal"}
    )
    return fleet_model, urban_model, fleet_holdout, urban_holdout


def score_reading(bundle: dict[str, Any], reading: dict[str, Any]) -> dict[str, Any]:
    if reading.get("sensorValid") is not True:
        return {
            "status": "sensor_issue",
            "prediction": "sensor_issue",
            "anomaly_candidate": None,
            "reason": "sensorValid must be true; invalid readings are not scored as environmental anomalies",
            "modelVersion": bundle["model_version"],
        }
    try:
        gas = float(reading["gasAdc"])
        temp = float(reading["temperature"])
        humidity = float(reading["humidity"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Reading needs numeric gasAdc, temperature, humidity, and sensorValid=true") from exc
    if not (0 <= gas <= 4095 and -40 <= temp <= 85 and 0 <= humidity <= 100):
        return {
            "status": "invalid_reading",
            "prediction": "sensor_issue",
            "anomaly_candidate": None,
            "reason": "one or more values are outside the accepted sensor ranges",
            "modelVersion": bundle["model_version"],
        }

    fleet_x = pd.DataFrame([[gas, temp, humidity]], columns=FLEET_FEATURES)
    urban_x = pd.DataFrame([[temp, humidity]], columns=URBAN_FEATURES)
    fleet_unusual = int(bundle["fleetmind_isolation_forest"].predict(fleet_x)[0]) == -1
    fleet_score = float(-bundle["fleetmind_isolation_forest"].decision_function(fleet_x)[0])
    urban_probability = float(bundle["urbaniot_temp_humidity_classifier"].predict_proba(urban_x)[0, 1])
    urban_flag = urban_probability >= bundle["urban_probability_threshold"]
    return {
        "status": "scored",
        "prediction": "anomaly" if fleet_unusual or urban_flag else "normal",
        "anomaly_candidate": bool(fleet_unusual or urban_flag),
        "fleetmind_baseline_unusual": fleet_unusual,
        "fleetmind_baseline_score": fleet_score,
        "urbaniot_anomaly_probability": urban_probability,
        "urbaniot_label_signal": bool(urban_flag),
        "reason": "flagged by at least one component" if fleet_unusual or urban_flag else "neither component flagged",
        "modelVersion": bundle["model_version"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fleet-csv", required=True, type=Path)
    parser.add_argument("--urban-zip", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "output")
    parser.add_argument("--score-json", help="Optional one-reading JSON object to score after training")
    args = parser.parse_args()

    fleet = prepare_fleetmind(args.fleet_csv)
    urban = prepare_urban(args.urban_zip)
    fleet_model, urban_model, fleet_holdout, urban_holdout = fit_models(fleet, urban)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "fleetmind_hybrid_prototype.joblib"
    fleet_scores_path = args.output_dir / "fleetmind_hybrid_holdout_scores.csv"
    urban_predictions_path = args.output_dir / "hybrid_urbaniot_holdout_predictions.csv"
    metrics_path = args.output_dir / "fleetmind_hybrid_metrics.json"
    bundle = {
        "model_version": MODEL_VERSION,
        "fleetmind_isolation_forest": fleet_model,
        "urbaniot_temp_humidity_classifier": urban_model,
        "fleetmind_features": FLEET_FEATURES,
        "urbaniot_features": URBAN_FEATURES,
        "urban_probability_threshold": URBAN_THRESHOLD,
        "combined_rule": "anomaly candidate if FleetMind Isolation Forest OR UrbanIoT classifier flags",
    }
    joblib.dump(bundle, model_path)
    fleet_holdout[[
        "timestamp", "gasAdc", "temperature", "humidity", "fleet_baseline_score",
        "fleet_baseline_unusual", "urbaniot_anomaly_probability", "urbaniot_label_signal",
        "hybrid_anomaly_candidate", "prediction",
    ]].to_csv(fleet_scores_path, index=False)
    urban_holdout[[
        "timestamp", *URBAN_FEATURES, "anomaly_label", "predicted_anomaly", "anomaly_probability"
    ]].to_csv(urban_predictions_path, index=False)

    y_true = urban_holdout.anomaly_label
    y_pred = urban_holdout.predicted_anomaly
    report = classification_report(y_true, y_pred, labels=[0, 1], output_dict=True, zero_division=0)
    metrics = {
        "model_version": MODEL_VERSION,
        "fleetmind_source": args.fleet_csv.name,
        "urbaniot_source": args.urban_zip.name,
        "fleetmind_valid_rows": len(fleet),
        "fleetmind_training_rows": int(len(fleet) * 0.8),
        "fleetmind_chronological_holdout_rows": len(fleet_holdout),
        "fleetmind_holdout_baseline_flags": int(fleet_holdout.fleet_baseline_unusual.sum()),
        "fleetmind_holdout_hybrid_candidate_flags": int(fleet_holdout.hybrid_anomaly_candidate.sum()),
        "fleetmind_labels": "unknown; holdout flags cannot be scored for accuracy",
        "urbaniot_training_rows": int(len(urban) * 0.75),
        "urbaniot_labeled_holdout_rows": len(urban_holdout),
        "urbaniot_holdout_accuracy": float(accuracy_score(y_true, y_pred)),
        "urbaniot_holdout_confusion_matrix_labels_0_then_1": confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist(),
        "urbaniot_holdout_classification_report": report,
        "feature_mapping": {
            "FleetMind": ["gasAdc", "temperature", "humidity"],
            "UrbanIoT supervised component": ["temp", "humidity"],
        },
        "fusion": bundle["combined_rule"],
        "warnings": [
            "UrbanIoT temperature/humidity model caught only the holdout metrics reported above; it may add false flags.",
            "UrbanIoT gas_level and all other UrbanIoT-only sensors are excluded; no gas-unit conversion is assumed.",
            "Combined candidate flags on FleetMind have no verified ground truth and are not measured accuracy.",
            "This is an offline prototype and is not connected to AWS, MQTT, Lambda, or the dashboard.",
        ],
        "model_file": model_path.name,
        "fleetmind_holdout_scores_file": fleet_scores_path.name,
        "urbaniot_holdout_predictions_file": urban_predictions_path.name,
    }
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    print(f"Model: {MODEL_VERSION}")
    print(f"FleetMind valid rows: {len(fleet)}; holdout: {len(fleet_holdout)}")
    print(f"FleetMind baseline flags: {metrics['fleetmind_holdout_baseline_flags']}/{len(fleet_holdout)}")
    print(f"Hybrid candidate flags: {metrics['fleetmind_holdout_hybrid_candidate_flags']}/{len(fleet_holdout)}")
    print(
        "UrbanIoT holdout anomaly precision/recall: "
        f"{report['1']['precision']:.3f}/{report['1']['recall']:.3f} "
        f"({int((y_true == 1).sum())} anomalies)"
    )
    print(f"Saved model and scores in: {args.output_dir.resolve()}")

    if args.score_json:
        result = score_reading(bundle, json.loads(args.score_json))
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
