#!/usr/bin/env python3
"""Score one FleetMind JSON reading with the saved hybrid prototype."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib

from train_hybrid_fleetmind import score_reading


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(__file__).resolve().parent / "output" / "fleetmind_hybrid_prototype.joblib",
    )
    parser.add_argument(
        "--reading-json",
        required=True,
        help='Reading JSON, e.g. \'{"temperature":25.1,"humidity":65.6,"gasAdc":367,"sensorValid":true}\'',
    )
    args = parser.parse_args()
    bundle = joblib.load(args.model)
    reading = json.loads(args.reading_json)
    print(json.dumps(score_reading(bundle, reading), indent=2))


if __name__ == "__main__":
    main()
