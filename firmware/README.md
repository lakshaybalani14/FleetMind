# FleetMind ESP32 firmware

This folder supplies the embedded side of FleetMind: an ESP32 reads DHT22 and MQ-2 data, filters insignificant changes at the edge, publishes MQTT telemetry securely to AWS IoT Core, receives cloud commands, operates a relay-controlled fan, and publishes an acknowledgement and its device-shadow state.

## Hardware wiring

| Part | ESP32 pin | Notes |
| --- | --- | --- |
| DHT22 data | GPIO 4 | Add a 4.7k–10k pull-up to 3.3V if your breakout does not include one. |
| MQ-2 analog out | GPIO 34 | ADC1 input; power the sensor according to the breakout's specification. Its output must not exceed 3.3V. |
| Relay input | GPIO 26 | Relay switches the fan. Set `RELAY_ACTIVE_HIGH` correctly for the board. |
| Status LED | GPIO 2 | Built-in LED on many ESP32 dev boards. |
| Unused | GPIO 27 | Reserved/free; no button is configured in the current firmware. |

Do not power a fan directly from an ESP32 GPIO. The relay module must have a suitable driver/power supply and the correct electrical isolation.

## Setup and flash

1. Install [PlatformIO](https://platformio.org/) and open `firmware/esp32-node`.
2. Copy `include/secrets.h.example` to `include/secrets.h` and enter Wi-Fi plus this board's unique AWS IoT certificate material. `secrets.h` is ignored by Git.
3. Set `NODE_ID` in `src/fleetmind_node_firmware.ino` to the matching AWS IoT Thing name. Use `node-01` and `node-02` for the two boards.
4. Build, upload, and monitor:

```text
pio run
pio run --target upload
pio device monitor
```

The project pins `espressif32@6.7.0`, which uses Arduino-ESP32 2.x. If you deliberately move to Arduino-ESP32 3.x, replace the legacy `esp_task_wdt_init(30, true)` call with its `esp_task_wdt_config_t` form.

## MQTT contract

| Topic | Direction | Purpose |
| --- | --- | --- |
| `fleetmind/{nodeId}/telemetry` | device → AWS | Filtered sensor payloads. |
| `fleetmind/{nodeId}/status` | device → AWS | Retained online/RSSI/relay heartbeat and LWT offline state. |
| `fleetmind/{nodeId}/events` | device → AWS | Actuator acknowledgement/audit event. |
| `fleetmind/{nodeId}/commands` | AWS → device | Direct command: `{"actionId":"uuid","relayOn":true}`. |
| `$aws/things/{nodeId}/shadow/update/delta` | AWS → device | Shadow desired-state delta: `{"state":{"relayOn":true,"actionId":"uuid"}}`. |
| `$aws/things/{nodeId}/shadow/update` | device → AWS | Reported relay/fan state. |

The cloud ingestion Lambda should translate `temperatureC`, `humidityPct`, and `gasPpmEstimate` into the dashboard's `temperature`, `humidity`, and `gasLevel` fields. A `timestamp` value of `0` means NTP was not yet available; the cloud must use its receipt time in that case.

## AWS IoT policy requirements

Give each Thing certificate only the minimum rights to connect as its own client ID, publish to its own `fleetmind/{nodeId}/*` topics and shadow-update topic, and subscribe/receive its own command and shadow-delta topics. Do not grant wildcard access to every device.

## What the FreeRTOS tasks do

| Task | Priority/core | Responsibility |
| --- | --- | --- |
| `TaskWiFiMQTT` | 3 / 0 | Connects Wi-Fi and TLS MQTT, synchronizes time, receives MQTT packets, and reconnects with exponential backoff. |
| `TaskSensorRead` | 2 / 1 | Samples DHT22/MQ-2 every two seconds and uses threshold/delta edge filtering before queuing telemetry. |
| `TaskPublish` | 2 / 1 | Serializes queued telemetry as JSON and publishes it without slowing sampling. |
| `TaskActuator` | 2 / 1 | Applies cloud commands, then emits an acknowledgement and shadow report. |
| `TaskHeartbeat` | 1 / 1 | Publishes retained connectivity state and feeds the watchdog. |

GPIO changes and MQTT calls happen in tasks, keeping actuator handling separate from network and sensor work.

## Known limits before field deployment

- MQ-2 PPM is an estimate, not a calibrated gas measurement. Calibrate its resistance curve and account for warm-up time before claiming PPM accuracy.
- The source does not store unsent telemetry durably. Add LittleFS/NVS buffering if offline data retention is required.
- Build the AWS IoT rule, Lambda validation/storage, anomaly service, and dashboard websocket/API integration separately; this firmware provides their topic and payload contract but cannot create those cloud resources.
