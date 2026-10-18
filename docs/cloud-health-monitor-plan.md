# FleetMind device-health monitor

Last updated: **2026-10-18**. The health-monitor route, EC2 timer, CloudWatch metrics/alarms, and SNS notification flow have been configured. The user reported that the alarm flow was tested and working. This page describes the current behavior; see the console guide for exact resource names and a repeatable acceptance check.

## Purpose and boundary

The monitor sends an SNS device-health notification only when the operator has armed monitoring for that node and the node has not sent an online status heartbeat within 180 seconds. This is separate from the dashboard's near-real-time online/offline status and its 90-second freshness behavior.

This feature monitors missing device status. It does not inspect gas, temperature, humidity, ML scores, or relay state to decide that a sensor hazard exists. Existing threshold alerts and relay behavior remain independent.

## Components

- **Dashboard switch:** enables/disables health notification for one node.
- **Authenticated API:** `POST /nodes/{nodeId}/monitoring` stores `monitoringEnabled` on the node row.
- **Telemetry/status Lambda:** updates `lastOnlineStatusAt` on online status heartbeats. Offline Last Will messages update dashboard status without erasing the most recent online heartbeat timestamp.
- **EC2 monitor:** a systemd timer runs about once per minute, reads configured node state from `FleetMindData`, and skips a node whose monitoring flag is false.
- **CloudWatch:** receives custom metrics in namespace `FleetMind/Health`:
  - `StatusWithin180Seconds`, with `NodeId` dimension, is `1` while the latest online status is at most 180 seconds old and `0` when older/missing.
  - `MonitorHeartbeat` is `1` after a successful monitor pass. A failed pass intentionally omits this metric so the monitor heartbeat alarm can detect it.
- **SNS:** CloudWatch alarm actions send device-health or monitor/EC2 health notifications to the configured subscription.

## Expected timing

The monitor runs once per minute. The device condition becomes false only after the 180-second window is exceeded; CloudWatch then needs its configured evaluation period before entering alarm. Delivery therefore takes longer than exactly 180 seconds. Short Wi-Fi reconnects can recover before the alarm. Planned shutdown should be preceded by turning the dashboard switch off; the existing dashboard online/offline indicator continues updating either way.

## Current user-reported setup

- The user completed the SNS, IAM role/policy, EC2 monitor, dashboard switch, and CloudWatch alarm setup in `ap-southeast-2`.
- The user reported the configured monitoring/alarm flow was working.
- Earlier checks confirmed the EC2 monitor timer ran, `MonitorHeartbeat=1` appeared, and Session Manager access worked. Instance running/stopped state can change; check EC2 before a repeat test.
- Recheck that only intended physical node IDs (for example, `node-01`) are included in `FLEET_NODE_IDS`; exclude simulated nodes.

## Safe acceptance sequence

1. Start the EC2 monitor and confirm its status checks pass. Use Session Manager; no inbound SSH is required.
2. Connect the board, enable device-health monitoring for its node, and verify `StatusWithin180Seconds=1` and alarm state OK.
3. For an outage test, stop only the board's status heartbeat or power down the board after enabling monitoring. Wait beyond 180 seconds plus the CloudWatch alarm evaluation. Confirm the device-health SNS email, then reconnect and confirm recovery.
4. Turn monitoring off before a planned shutdown. Confirm the dashboard still reflects actual online/offline state and no device SNS alarm is sent for that planned downtime.
5. Verify the monitor heartbeat alarm separately through CloudWatch, and verify EC2 instance status-check alarms target the same SNS topic.

Do not create gas, smoke, or heat hazards to test the monitor. No synthetic sensor payload is needed: the health alarm depends on device status heartbeats.

## Source files

- `infra/health-monitor/monitor.py` — DynamoDB check and CloudWatch metric publishing.
- `infra/health-monitor/fleetmind-health-monitor.service` and `.timer` — systemd execution schedule.
- `infra/health-monitor/instance-policy.json` — scoped read and metric-write permissions.
- `infra/lambda/index.ts` — authenticated monitoring route and online status timestamp.
- `src/components/fleet/MonitorDrawer.tsx` — monitoring control in the dashboard.
- [Console setup and acceptance guide](cloud-health-monitor-console-guide.md)
