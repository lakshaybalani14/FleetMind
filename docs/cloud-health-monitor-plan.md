# FleetMind device-health SNS monitor

Status as of 2026-10-18: the Lambda monitoring route and EC2 monitor are
deployed in `ap-southeast-2`. The EC2 timer is installed, and CloudWatch
`MonitorHeartbeat=1` was verified before the instance was stopped until the
next session. The dashboard switch remains off for `node-01`; device metrics
and CloudWatch alarms still need live verification. Resume with the batches in
[`cloud-health-monitor-console-guide.md`](cloud-health-monitor-console-guide.md).

## Behavior

- The existing dashboard keeps its current online/offline display and 90-second
  freshness behavior.
- A dashboard switch controls whether SNS connectivity notifications are armed
  for that node. It defaults to off, so an intentionally unused board does not
  alert. Turn it on when you start monitoring; turn it off before planned
  shutdown.
- The EC2 monitor checks once a minute. It publishes `StatusWithin180Seconds=1`
  while an enabled node has sent an online status heartbeat within 180 seconds,
  otherwise `0`. The SNS notification therefore arrives after the 180-second
  window plus CloudWatch evaluation delay.
- This feature only alerts for missing board status. Sensor values, threshold
  alerts, ML scores, and relay control are not changed.

## Data path

The existing IoT status Lambda writes `lastOnlineStatusAt` only when it receives
an online heartbeat. The LWT/offline status still updates the existing `status`
and `lastSeen` values used by the dashboard; it does not erase the last online
heartbeat timestamp. The authenticated dashboard endpoint stores
`monitoringEnabled` on the node row. The EC2 monitor reads those fields from
`FleetMindData` and publishes bounded CloudWatch metrics in `FleetMind/Health`.

The monitor publishes `MonitorHeartbeat=1` only after a successful run. A
CloudWatch alarm on missing monitor heartbeats reveals EC2 or process failure.
The IAM policy in `infra/health-monitor/instance-policy.json` limits DynamoDB
reads to this table and metric writes to this namespace; attach
`AmazonSSMManagedInstanceCore` separately for Session Manager.

## Console setup order

Follow [cloud-health-monitor-console-guide.md](cloud-health-monitor-console-guide.md)
in batches. Confirm the selected Region in AWS Settings > View all projects >
Overview > Additional Info > Region; all regional resources must use it. The
current project notes say `ap-southeast-2`.

Before any production deploy, reconcile the existing manually managed AWS
stack with the local CDK stack. Do not deploy the whole CDK stack just for this
feature until that drift review is complete.
