#!/usr/bin/env python3
"""Train and score fictional FleetMind-shaped readings with Isolation Forest.

This demonstrates the software flow only. Values are synthetic examples, not
physical sensor measurements, validated detection behavior, or safety limits.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone

import numpy as np
from sklearn.ensemble import IsolationForest

FEATURES = ["gasAdc", "temperatureC", "humidityPct"]
MODEL_VERSION = "fleetmind-synthetic-demo-0.1"
ADC_MAX = 4095


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--training-readings", type=int, default=1000)
    args = parser.parse_args()
    if args.training_readings < 100:
        parser.error("--training-readings must be at least 100")

    # Invent a steady normal baseline solely to demonstrate model training.
    rng = np.random.default_rng(args.seed)
    training = np.column_stack(
        (
            rng.normal(1200, 90, args.training_readings),
            rng.normal(24, 0.8, args.training_readings),
            rng.normal(50, 3, args.training_readings),
        )
    )
    # For this toy example, allow a wider outlier fraction so the synthetic
    # far-away example falls beyond the model's learned cutoff.
    model = IsolationForest(n_estimators=200, contamination=0.10, random_state=args.seed)
    model.fit(training)

    # Two illustrative one-reading requests: one near baseline, one far away.
    examples = [
        ("example_inside_baseline", [1200.0, 24.0, 50.0]),
        ("injected_far_from_baseline", [3500.0, 24.0, 50.0]),
    ]
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    print(f"Model: {MODEL_VERSION}")
    print("SIMULATION ONLY — no readings came from a physical sensor.")
    print("Features: gasAdc, temperatureC, humidityPct")
    print("Fictional training baseline centers: gasAdc=1200, temperatureC=24, humidityPct=50")
    print("\n timestamp (UTC)          gasAdc  tempC  humidity  model result  alert  example")

    for case, values in examples:
        gas, temp, humidity = values
        sensor_valid = bool(np.isfinite(values).all() and 0 <= gas <= ADC_MAX)
        if not sensor_valid:
            result, score_text = "sensor_issue", "n/a"
            demo_rule = "sensor issue"
        else:
            row = np.array([values])
            result = "unusual" if model.predict(row)[0] == -1 else "normal"
            score_text = f"{-float(model.decision_function(row)[0]):.3f}"
        alert = "YES" if result == "unusual" else "no"
        print(
            f" {timestamp:22s} {gas:7.0f} {temp:6.1f} {humidity:9.1f}"
            f"  {result:12s} {alert:5s}  {case} (model score {score_text})"
        )

    print("\nContamination is set to 10% only to demonstrate the model cutoff.")
    print("It is not a real-world anomaly-rate estimate or gas safety limit.")
    print("A real detector requires recorded ESP32 readings and evaluation before deployment.")


if __name__ == "__main__":
    main()
