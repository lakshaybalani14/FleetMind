# Relay control: manual, threshold, and model-triggered

## What this adds

The local code supports one bidirectional relay path:

```text
Dashboard (Cognito) → HTTP API → Lambda → IoT command topic → ESP32 relay
Dashboard ← WebSocket ← Lambda ← IoT acknowledgement ← ESP32
```

Manual mode lets an operator turn the relay on or off. Automatic mode uses
configured gas/temperature thresholds (the baseline controller) and an
`isAnomaly: true` prediction from the teammate's model can also request
relay-on. Both use the same device command, acknowledgement, DynamoDB status,
and dashboard update. Manual relay commands switch that node back to manual
mode.

Automatic control is off by default. MQ-2 `gasPpmEstimate` is not calibrated
PPM, so do not enable threshold automation until the sensor is calibrated and
the team has selected safe on/off points. The off point is lower than the on
point (hysteresis) to prevent rapid relay cycling.

## AWS setup reference

The running resources were created manually and verified in the selected
Region, `ap-southeast-2`. Do not deploy the whole CDK stack as part of this
setup; it may create duplicates. These steps document the existing setup and
are only needed again if resources must be recreated or updated.

1. **Package and upload the telemetry Lambda.** From the repository root run:

   ```powershell
   cd infra
   npm ci
   New-Item -ItemType Directory -Force lambda-deploy-actuator | Out-Null
   npx esbuild lambda/index.ts --bundle --platform=node --target=node22 --outfile=lambda-deploy-actuator/index.js
   Compress-Archive -Path lambda-deploy-actuator/index.js -DestinationPath fleetmind-actuator-control.zip -Force
   ```

   Upload `infra/fleetmind-actuator-control.zip` to the existing telemetry/API
   Lambda that already handles IoT telemetry and dashboard HTTP requests. Its
   deployed code hash was verified to match this ZIP. Do not replace the
   separate WebSocket `$connect`/`$disconnect` functions.

2. **Configure the telemetry Lambda.** Keep its existing variables and add:

   | Variable | Value |
   | --- | --- |
   | `IOT_DATA_ENDPOINT` | The account-specific HTTPS IoT data endpoint shown in AWS IoT Core → Settings in `ap-southeast-2`. |
   | `AUTO_CONTROL_ENABLED` | `false` for the first manual-control test. |
   | `AUTO_GAS_ON_PPM` / `AUTO_GAS_OFF_PPM` | Leave empty until MQ-2 is calibrated. |
   | `AUTO_TEMP_ON_C` / `AUTO_TEMP_OFF_C` | Leave empty until the team selects safe temperature limits. |
   | `AUTO_COMMAND_COOLDOWN_SECONDS` | `10` initially. |

   Save the variables, then wait for the Lambda update to finish.

3. **Allow the Lambda execution role to publish commands.** Add an identity
   policy to the telemetry Lambda's execution role:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublishFleetMindNodeCommands",
       "Effect": "Allow",
       "Action": "iot:Publish",
       "Resource": "arn:aws:iot:ap-southeast-2:467008425206:topic/fleetmind/node-*/commands"
     }]
   }
   ```

   This is only for cloud-to-device publish. The Thing certificate policy must
   separately allow each device to subscribe/receive its own command topic and
   publish to its own `events` acknowledgement topic.

4. **Create the acknowledgement IoT rule.** In AWS IoT Core → Message routing
   → Rules, create an enabled rule with SQL:

   ```sql
   SELECT * FROM 'fleetmind/+/events' WHERE eventType = 'actuator_ack'
   ```

   Add a Lambda action targeting the same telemetry Lambda. Let the console add
   the rule's invoke permission, or add a Lambda resource permission for
   principal `iot.amazonaws.com`, scoped to this rule ARN. The firmware already
   publishes acknowledgements to this topic.

5. **Add routes to the existing dashboard HTTP API.** Create these routes using
   the existing Lambda integration, Cognito JWT authorizer, and deployed stage:

   - `POST /nodes/{nodeId}/relay`
   - `POST /nodes/{nodeId}/automation`

   If they already exist, verify their Lambda integration and authorizer rather
   than creating duplicates. Deploy the API changes to its active stage.

6. **Update and run the dashboard locally.** The code uses the existing API and
   Cognito configuration. Restart the Next.js development server after pulling
   these changes so its latest bundle is loaded.

## Test in batches

### Batch A — manual round trip

1. Keep `AUTO_CONTROL_ENABLED=false`; upload the firmware that subscribes to
   `fleetmind/{nodeId}/commands` and publishes `actuator_ack` to
   `fleetmind/{nodeId}/events`.
2. Open the authenticated dashboard and select an online node.
3. Click **Turn fan on**, then **Turn fan off**. The dashboard should say it is
   waiting, and only show the confirmed state after an acknowledgement arrives.
4. Confirm the acknowledgement in the Lambda CloudWatch log, the latest node
   item in `FleetMindData` (`actuatorState`, `lastActuatorActionId`), and the
   dashboard Action Log. Test with the fan safely disconnected or supervised
   before a live load.

If the API returns 503, check `IOT_DATA_ENDPOINT`; for publish authorization
errors, check the execution-role `iot:Publish` policy. If the command publishes
but no acknowledgement appears, check the Thing's command subscription,
events-topic publish permission, firmware serial output, and the acknowledgement
IoT rule.

### Batch B — baseline threshold automation

1. Calibrate MQ-2 and agree gas/temperature on/off thresholds with the team.
2. Set `AUTO_CONTROL_ENABLED=true` and all four numeric threshold variables on
   the telemetry Lambda; keep off thresholds below their corresponding on
   thresholds. Save and wait for the update to finish.
3. Enable **Automatic thresholds** for one node in the dashboard.
4. Using safe sensor simulation or controlled readings, verify that crossing
   either on threshold requests relay-on, values in the hysteresis band do not
   cause repeated switching, and both readings below their off thresholds
   request relay-off. Confirm every change via device acknowledgement.
5. Click **Turn fan on/off** manually; this must switch that node to Manual.

### Later — Isolation Forest model

When the model service is ready, connect its prediction output to the telemetry
ingestion contract as `isAnomaly: true/false` (or update the contract with the
team's reviewed result schema). In Automatic mode, `isAnomaly: true` requests
relay-on through the existing safe command/ack path. Thresholds remain the
baseline and release behavior; agree on how the model clears an anomaly before
allowing it to request relay-off. Do not have the model publish MQTT commands
directly until ownership, authorization, and audit behavior are reviewed.

## Current implementation status (2026-10-10)

- Local source: manual route, baseline threshold controller, anomaly-flag hook,
  dashboard controls, IoT acknowledgement handler, WebSocket updates, and CDK
  reference changes are implemented.
- AWS setup verified: deployed Lambda ZIP hash matches local code,
  `AUTO_CONTROL_ENABLED` is `false`, the scoped IoT publish permission and
  acknowledgement rule exist, and both Cognito-protected HTTP routes are
  deployed to `$default`.
- Not board-verified: dashboard-to-relay-to-ack round trip or automated
  threshold behavior.
- Not ready to enable: production threshold automation before MQ-2 calibration.
