# Console setup: EC2 + CloudWatch + SNS

## Current handoff — 2026-10-18

- SNS topic/email subscription, IAM policy/role, Lambda route, and EC2 instance
  are configured in `ap-southeast-2`.
- Lambda `fleetmind-telemetry-api` includes `POST /nodes/{nodeId}/monitoring`.
  The `$default` API stage auto-deploy is enabled.
- EC2 instance `i-0db768c88c910361b` is running and reachable through Session
  Manager. Its timer is active, and `MonitorHeartbeat=1` has been seen in
  `FleetMind/Health`.
- Monitoring is currently disabled for the real board `node-01`. The other
  DynamoDB node, `node-sim-20261010`, is a simulated node and is not included in
  the monitor configuration.
- Resume by enabling notifications for `node-01` in the dashboard, confirming
  `StatusWithin180Seconds=1`, then creating and safely testing the CloudWatch
  alarms below. The dashboard switch is present in the local app; hosted UI
  publication has not been confirmed.

Use this after deploying the application code that adds `lastOnlineStatusAt`
and the dashboard monitoring switch. Do each batch, then verify the listed
result before moving to the next batch.

## Batch 1 — prepare notifications

1. In AWS Settings, confirm the project’s selected Region. Use that Region for
   SNS, EC2, and CloudWatch. Current project notes list `ap-southeast-2`.
2. AWS Console → **Amazon SNS** → **Topics** → **Create topic** → **Standard**.
   Name it `fleetmind-device-health`; create it with the default settings.
3. Open the topic → **Create subscription** → protocol **Email** → enter your
   alert email → create. Open the confirmation email and confirm.

Verify: topic exists and subscription status is **Confirmed**.

## Batch 2 — create the EC2 monitor role

1. AWS Console → **IAM** → **Policies** → **Create policy** → JSON. Copy
   `infra/health-monitor/instance-policy.json`, replacing
   `REPLACE_WITH_FLEETMINDDATA_TABLE_ARN` with the ARN of `FleetMindData` and
   `REPLACE_WITH_HISTORY_BUCKET_ARN` with the existing telemetry-history bucket
   ARN from the stack outputs (no trailing slash).
   Name it `FleetMindHealthMonitorPolicy` and create it.
2. IAM → **Roles** → **Create role** → trusted entity **AWS service** → use
   case **EC2**. Attach `AmazonSSMManagedInstanceCore` and
   `FleetMindHealthMonitorPolicy`. Name it `FleetMindHealthMonitorRole`.

Verify: the role’s trusted entity is EC2 and both policies are attached.

## Batch 3 — launch the instance

1. AWS Console → **EC2** → **Launch instance**. Name: `fleetmind-health-monitor`.
2. Choose Amazon Linux 2023, a small instance such as `t3.micro`, and a subnet
   with outbound internet access. Assign a public IPv4 address if that is the
   subnet’s simplest outbound path. Do not add inbound rules; do not create or
   download an SSH key.
3. Under **Advanced details**, choose IAM instance profile
   `FleetMindHealthMonitorRole`. Require IMDSv2 if the option is shown. Launch.
4. Wait until the instance is running and its status checks pass. EC2 → **Connect**
   → **Session Manager** → Connect. If it is not a managed node, stop and fix
   its role or outbound HTTPS route before continuing.

Verify: Session Manager opens without SSH and the instance has no inbound SSH
rule.

## Batch 4 — upload and install the monitor

From the project folder on your PC, create the deployment ZIP:

```powershell
.\infra\health-monitor\package.ps1
```

AWS Console → **S3** → open the existing FleetMind telemetry-history bucket →
create folder `health-monitor` → upload
`infra/health-monitor/fleetmind-health-monitor.zip` into it. Then open the EC2
Session Manager shell and run these commands, replacing the bucket name and
selected Region:

```bash
sudo useradd --system --no-create-home --shell /sbin/nologin fleetmind || true
sudo mkdir -p /opt/fleetmind-health-monitor /etc/fleetmind-health-monitor
aws s3 cp s3://<history-bucket>/health-monitor/fleetmind-health-monitor.zip /tmp/fleetmind-health-monitor.zip --region <selected-region>
sudo unzip -o /tmp/fleetmind-health-monitor.zip -d /opt/fleetmind-health-monitor
sudo python3 -m venv /opt/fleetmind-health-monitor/venv
sudo /opt/fleetmind-health-monitor/venv/bin/pip install boto3
sudo install -o root -g fleetmind -m 0640 /dev/null /etc/fleetmind-health-monitor/config
sudo cp /opt/fleetmind-health-monitor/fleetmind-health-monitor.service /etc/systemd/system/
sudo cp /opt/fleetmind-health-monitor/fleetmind-health-monitor.timer /etc/systemd/system/
sudo chown -R root:root /opt/fleetmind-health-monitor
```

Edit `/etc/fleetmind-health-monitor/config`:

```bash
sudo nano /etc/fleetmind-health-monitor/config
```

Set it to:

```text
AWS_REGION=<selected-region>
FLEET_TABLE_NAME=FleetMindData
FLEET_NODE_IDS=node-01
```

Replace `node-01` with the exact node IDs you use. Then enable and start the
timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fleetmind-health-monitor.timer
sudo systemctl start fleetmind-health-monitor.service
sudo systemctl status fleetmind-health-monitor.service
```

The ZIP contains the repo’s `monitor.py`, `.service`, and `.timer` files. Keep
the config readable only by root and the `fleetmind` group.

Verify: service exits successfully. In CloudWatch → **Metrics** → **All metrics**
→ custom namespace `FleetMind/Health`, `MonitorHeartbeat` has a value of `1`.

## Batch 5 — create CloudWatch alarms

For each configured node, first use the dashboard switch to enable health
notifications. Wait for its `StatusWithin180Seconds` metric to appear.

1. CloudWatch → **Alarms** → **Create alarm** → select metric
   `FleetMind/Health` → `StatusWithin180Seconds` → dimension `NodeId` → choose
   the exact node ID.
2. Statistic **Minimum**, period **1 minute**; condition **Lower** than `1`,
   evaluation `1 of 1` datapoints. Set missing data to **not breaching**. Select
   SNS topic `fleetmind-device-health` for **In alarm** and recovery actions.
   Name `FleetMind-<nodeId>-NoStatus-180s`.
3. Create a second alarm for `MonitorHeartbeat`: statistic **Minimum**, period
   **1 minute**, condition **Lower** than `1`, evaluation `3 of 3` periods, and
   missing data **breaching**. Send alarm and recovery actions to the same SNS
   topic. Name it `FleetMind-Monitor-Heartbeat-Missing`.
4. Create alarms on the instance’s `StatusCheckFailed_Instance` and
   `StatusCheckFailed_System` metrics (period 1 minute, greater than 0 for 2
   of 3 periods), with the same SNS actions.

Verify: each alarm shows the expected metric/dimension and the SNS topic action.
For the device alarm, confirm the dashboard switch is enabled before testing.

## Batch 6 — safe acceptance checks

1. With device monitoring enabled, wait for a fresh online heartbeat and confirm
   `StatusWithin180Seconds=1` and alarm state **OK**.
2. Briefly interrupt status for less than 180 seconds, then reconnect. Confirm
   no SNS device notification arrives and the dashboard continues its existing
   online/offline updates.
3. For a controlled outage test, enable monitoring, stop the board’s status
   heartbeat, and wait at least 180 seconds plus up to one CloudWatch period.
   Confirm one SNS notification. Restore the board and confirm recovery.
4. Disable monitoring in the dashboard before a planned power-off. Confirm no
   new device notification is sent. A previously active CloudWatch alarm may
   take a period to return to OK because its metric becomes absent.
5. Check CloudWatch Logs for EC2 service output using Session Manager:
   `sudo journalctl -u fleetmind-health-monitor.service -n 50 --no-pager`.

Do not test with unsafe gas/smoke or by creating a real hazard. No MQTT test
payload is needed for these connectivity checks.
