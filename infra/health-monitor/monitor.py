#!/usr/bin/env python3
"""Publish FleetMind board-health metrics from the EC2 monitor host."""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

NAMESPACE = "FleetMind/Health"
TABLE_NAME = os.environ.get("FLEET_TABLE_NAME", "")
NODE_IDS = tuple(filter(None, (value.strip() for value in os.environ.get("FLEET_NODE_IDS", "").split(","))))
REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
THRESHOLD_SECONDS = 180

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fleetmind-health-monitor")


def main() -> int:
    if not TABLE_NAME or not NODE_IDS or not REGION:
        logger.error("FLEET_TABLE_NAME, FLEET_NODE_IDS and AWS_REGION are required")
        return 2

    dynamodb = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
    cloudwatch = boto3.client("cloudwatch", region_name=REGION)
    now = datetime.now(timezone.utc)
    metric_data: list[dict] = []

    try:
        for node_id in NODE_IDS:
            response = dynamodb.get_item(
                Key={"PK": "FLEET", "SK": f"NODE#{node_id}"},
                ConsistentRead=True,
            )
            node = response.get("Item")
            if not node:
                raise RuntimeError(f"Configured node does not exist in DynamoDB: {node_id}")
            if node.get("monitoringEnabled") is not True:
                logger.info("Monitoring disabled for %s", node_id)
                continue

            raw_timestamp = node.get("lastOnlineStatusAt")
            try:
                last_online = datetime.fromisoformat(str(raw_timestamp).replace("Z", "+00:00"))
                if last_online.tzinfo is None:
                    last_online = last_online.replace(tzinfo=timezone.utc)
                age_seconds = max(0.0, (now - last_online.astimezone(timezone.utc)).total_seconds())
                within_window = age_seconds <= THRESHOLD_SECONDS
            except (TypeError, ValueError):
                age_seconds = float("inf")
                within_window = False

            metric_data.append({
                "MetricName": "StatusWithin180Seconds",
                "Dimensions": [{"Name": "NodeId", "Value": node_id}],
                "Timestamp": now,
                "Value": 1 if within_window else 0,
                "Unit": "Count",
            })
            logger.info("Node %s last online heartbeat age is %.0fs; within window=%s", node_id, age_seconds, within_window)

        if metric_data:
            cloudwatch.put_metric_data(Namespace=NAMESPACE, MetricData=metric_data)

        # Report monitor health only after all configured DynamoDB reads and device metric writes succeed.
        cloudwatch.put_metric_data(Namespace=NAMESPACE, MetricData=[{
            "MetricName": "MonitorHeartbeat",
            "Timestamp": now,
            "Value": 1,
            "Unit": "Count",
        }])
    except (BotoCoreError, ClientError, RuntimeError):
        logger.exception("Health-monitor run failed; monitor heartbeat intentionally omitted")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
