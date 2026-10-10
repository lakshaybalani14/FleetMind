#!/usr/bin/env python3
"""Train a labeled anomaly classifier from UrbanIoT's sensor_data.csv in a ZIP.

This models the dataset's own anomaly_label, not FleetMind ground truth.
"""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

FEATURE_SETS = {
    "all": (["temp", "humidity", "gas_level", "vibration", "noise", "motion"], ["location_id"]),
    "temperature_humidity": (["temp", "humidity"], []),
}


def load_sensor_csv(archive_path: Path) -> pd.DataFrame:
    with zipfile.ZipFile(archive_path) as archive:
        matches = [name for name in archive.namelist() if name.rsplit("/", 1)[-1] == "sensor_data.csv"]
        if len(matches) != 1:
            raise ValueError(f"Expected one sensor_data.csv in the ZIP; found {len(matches)}")
        with archive.open(matches[0]) as stream:
            return pd.read_csv(io.BytesIO(stream.read()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-zip", required=True, type=Path, help="UrbanIoT dataset ZIP")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "output",
        help="Local output directory (Git-ignored)",
    )
    parser.add_argument("--train-fraction", type=float, default=0.75)
    parser.add_argument(
        "--feature-set",
        choices=FEATURE_SETS,
        default="all",
        help="Use all dataset sensors, or only temperature and humidity",
    )
    args = parser.parse_args()
    if not 0.5 <= args.train_fraction < 1:
        parser.error("--train-fraction must be at least 0.5 and less than 1")

    data = load_sensor_csv(args.input_zip)
    if "anomaly_label" not in data:
        parser.error("sensor_data.csv needs an anomaly_label column for supervised training")

    selected_numeric, selected_categorical = FEATURE_SETS[args.feature_set]
    available_numeric = [name for name in selected_numeric if name in data.columns]
    available_categorical = [name for name in selected_categorical if name in data.columns]
    numeric_features = [
        name for name in available_numeric if pd.to_numeric(data[name], errors="coerce").notna().any()
    ]
    if not numeric_features and not available_categorical:
        parser.error("No usable sensor feature columns were found")

    data["timestamp"] = pd.to_datetime(data.get("timestamp"), errors="coerce", utc=True)
    data["anomaly_label"] = pd.to_numeric(data["anomaly_label"], errors="coerce")
    data = data[data["anomaly_label"].isin([0, 1])].copy()
    for feature in numeric_features:
        data[feature] = pd.to_numeric(data[feature], errors="coerce")
    data = data.dropna(subset=["timestamp"]).sort_values("timestamp", kind="stable").reset_index(drop=True)
    data["anomaly_label"] = data["anomaly_label"].astype(int)
    if data["anomaly_label"].nunique() != 2:
        parser.error("Need both normal (0) and anomaly (1) examples in anomaly_label")

    split_at = int(len(data) * args.train_fraction)
    training = data.iloc[:split_at].copy()
    holdout = data.iloc[split_at:].copy()
    if training["anomaly_label"].nunique() != 2 or holdout["anomaly_label"].nunique() != 2:
        parser.error("Chronological train and holdout sections must each contain both labels")

    transformers = []
    if numeric_features:
        transformers.append(
            (
                "numeric",
                SimpleImputer(strategy="median", add_indicator=True),
                numeric_features,
            )
        )
    if available_categorical:
        transformers.append(
            (
                "categorical",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                available_categorical,
            )
        )

    features = numeric_features + available_categorical
    model = Pipeline(
        [
            ("preprocess", ColumnTransformer(transformers=transformers, remainder="drop")),
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
    model.fit(training[features], training["anomaly_label"])

    holdout["predicted_anomaly"] = model.predict(holdout[features]).astype(int)
    holdout["anomaly_probability"] = model.predict_proba(holdout[features])[:, 1]
    y_true = holdout["anomaly_label"]
    y_pred = holdout["predicted_anomaly"]
    report = classification_report(y_true, y_pred, labels=[0, 1], output_dict=True, zero_division=0)
    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    suffix = "temperature_humidity" if args.feature_set == "temperature_humidity" else "all_sensors"
    model_version = f"urbaniot-supervised-random-forest-{suffix}-0.1"
    model_path = args.output_dir / f"urbaniot_{suffix}_anomaly_model.joblib"
    predictions_path = args.output_dir / f"urbaniot_{suffix}_holdout_predictions.csv"
    metrics_path = args.output_dir / f"urbaniot_{suffix}_model_metrics.json"
    joblib.dump(model, model_path)
    holdout[["timestamp", *features, "anomaly_label", "predicted_anomaly", "anomaly_probability"]].to_csv(
        predictions_path, index=False
    )
    metrics = {
        "model_version": model_version,
        "dataset": args.input_zip.name,
        "source_file_in_archive": "sensor_data.csv",
        "purpose": "practice model for the UrbanIoT dataset's own labels; not FleetMind deployment",
        "algorithm": "RandomForestClassifier with class-balanced subsampling",
        "feature_set": args.feature_set,
        "features_used": features,
        "numeric_features_present": numeric_features,
        "categorical_features_present": available_categorical,
        "dropped_absent_sensor_columns": [name for name in selected_numeric if name not in data.columns],
        "train_split": "chronological",
        "train_fraction": args.train_fraction,
        "training_rows": len(training),
        "holdout_rows": len(holdout),
        "training_label_counts": training["anomaly_label"].value_counts().sort_index().to_dict(),
        "holdout_label_counts": y_true.value_counts().sort_index().to_dict(),
        "holdout_accuracy": float(accuracy_score(y_true, y_pred)),
        "holdout_confusion_matrix_labels_0_then_1": matrix,
        "holdout_classification_report": report,
        "limitations": [
            "Results measure agreement with this dataset's anomaly_label only.",
            "This model is not trained on FleetMind raw gasAdc and is not a FleetMind sensor model.",
            "The separate image_metadata.csv labels are not used.",
        ],
        "model_file": model_path.name,
        "holdout_predictions_file": predictions_path.name,
    }
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    print(f"Model: {model_version}")
    print(f"Rows: {len(data)}; training: {len(training)}; later holdout: {len(holdout)}")
    print(f"Features used: {', '.join(features)}")
    print(f"Holdout label counts (normal/anomaly): {matrix[0][0] + matrix[0][1]}/{matrix[1][0] + matrix[1][1]}")
    print(f"Holdout accuracy: {accuracy_score(y_true, y_pred):.3f}")
    print(f"Anomaly precision: {report['1']['precision']:.3f}; recall: {report['1']['recall']:.3f}; F1: {report['1']['f1-score']:.3f}")
    print(f"Saved model, holdout predictions, and metrics under: {args.output_dir.resolve()}")
    print("Reminder: this predicts the ZIP's labels; it is not a FleetMind MQ model.")


if __name__ == "__main__":
    main()
