# FleetMind project status

Last reviewed: **2026-10-18**.

## Completion status

**Complete for the prototype/demo scope.** The user confirmed that the project tests and end-to-end checks have been completed. The ESP32 telemetry path, dashboard behavior, threshold alerts, relay control, Bedrock alert explanations, and device-health notification flow are considered complete for the demonstrated project.

This completion status describes the prototype and its agreed demo scope. It does not mean the sensor thresholds are calibrated for safety use or that the service has completed production hardening.

### Fan and buzzer output

The final prototype check is complete. The 5 V active buzzer is wired in parallel with the fan on the relay-switched output, so manual and automatic relay commands operate both together. No separate buzzer GPIO is used. In automatic mode, the ESP32 continues publishing real readings about every two seconds; a subsequent normal reading can clear a one-off synthetic alert and turn both loads off. This is expected threshold behavior, not a timed shutoff.

| Workstream | Completed outcome |
| --- | --- |
| ESP32 telemetry and device status | Board readings and status updates reach the AWS pipeline and appear in the dashboard. |
| AWS ingestion and persistence | IoT events are processed by Lambda, stored in DynamoDB/S3, and streamed to connected dashboards. |
| Dashboard | Authenticated live readings, node status, charts, alerts, and activity history are available. |
| Threshold alerts | Demo threshold events are recorded and shown in the dashboard. |
| Relay control | Manual relay commands and device acknowledgements are reflected in dashboard state and activity history. |
| Fan and buzzer | Both loads switch together through the relay; the user confirmed the final hardware check. |
| Bedrock explanations | Nova Micro can explain an already-triggered threshold alert; a fallback explanation is available. |
| Device-health notifications | The monitoring switch, 180-second missing-status behavior, CloudWatch alarms, and SNS flow were configured and tested, as confirmed by the user. |
| Project documentation | Hardware connections, event workflows, AWS components, testing notes, and limitations are documented. |

## ML anomaly-detection experiment

Anomaly-model training and scoring were attempted with public data, FleetMind readings, and synthetic examples. The experiments did **not** produce production-quality FleetMind results: the reviewed holdout contained 19 real room readings confirmed as normal by the user that the detector flagged, alongside one deliberately synthetic 61 °C payload. This evidence is not enough to claim reliable real-world anomaly detection.

The model remains an offline experiment. It is not connected to the live dashboard, threshold alerts, SNS, or relay control. Improving or replacing it is future research and does not block the completed prototype. See [Anomaly detection: experiment and limitations](anomaly-service-plan.md).

## Safety and interpretation

The current gas value is a relative MQ-2 estimate, not a calibrated gas concentration or a carbon-monoxide measurement. Demo thresholds demonstrate software behavior only. Keep certified alarms independent, and use safe, controlled inputs for tests. Bedrock explains the deterministic threshold result; it does not decide whether an alert fires or control the relay.

## Optional future enhancements

These are ideas for a later version, not outstanding project verification:

- Query and visualize historical S3 telemetry with Athena.
- Reconcile the manually configured AWS resources with the local CDK definition before a future infrastructure deployment.
- Consider hosted dashboard deployment and additional production security, retention, and cost reviews if the prototype is expanded into a production service.
- Collect reviewed, representative FleetMind data and evaluate the false-positive and missed-event rates before reconsidering ML anomaly detection.

Known differences between the local CDK template and manually configured AWS resources are documented in [the infrastructure README](../infra/README.md). They did not prevent the tested prototype workflows and should be reconciled before a future CDK deployment.

## Project references

- [Complete event workflows and example payloads](project-events.md)
- [Dated live-testing log](live-testing-log.md)
- [Cloud-health monitor console guide](cloud-health-monitor-console-guide.md)
- [Firmware setup and pin map](../firmware/README.md)
- [AWS backend and infrastructure notes](../infra/README.md)
