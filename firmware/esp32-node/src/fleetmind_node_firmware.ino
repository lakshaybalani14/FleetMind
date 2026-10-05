/*
 * FleetMind ESP32 edge node
 *
 * Hardware: DHT22 (temperature/humidity), MQ-2 (gas/smoke), relay-controlled
 * exhaust fan, status LED, and an optional emergency button.
 *
 * Tasks are pinned deliberately: Wi-Fi/MQTT stays responsive on core 0; sensor,
 * publisher, actuator, and heartbeat work run on core 1.  Queues prevent a slow
 * network operation from blocking the sensor/actuator tasks.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHTesp.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "secrets.h" // Copy include/secrets.h.example to include/secrets.h first.

// Change NODE_ID for the second board. It must match its AWS IoT Thing name.
#define NODE_ID "node-01"

// GPIO34 is ADC1, so MQ-2 reads continue to work while Wi-Fi is enabled.
#define MQ2_PIN 34
#define DHT22_PIN 4
#define RELAY_PIN 26
#define STATUS_LED_PIN 2
#define EMERGENCY_BUTTON_PIN 27 // Optional normally-open button wired to GND.
#define RELAY_ACTIVE_HIGH true  // Set false for common active-low relay boards.

// MQ-2 values are estimates until calibrated with known gas concentrations.
#define MQ2_ADC_MAX 4095.0f
#define MQ2_ESTIMATED_PPM_AT_FULL_SCALE 1000.0f
#define GAS_ANOMALY_PPM 400.0f
#define TEMP_ANOMALY_C 60.0f

#define SAMPLE_INTERVAL_MS 2000UL
#define HEARTBEAT_INTERVAL_MS 15000UL
#define MAX_TELEMETRY_SILENCE_MS 30000UL
#define GAS_DELTA_PPM 20.0f
#define TEMP_DELTA_C 0.5f
#define HUMIDITY_DELTA_PCT 3.0f

#define AWS_IOT_PORT 8883
#define TOPIC_TELEMETRY "fleetmind/" NODE_ID "/telemetry"
#define TOPIC_STATUS "fleetmind/" NODE_ID "/status"
#define TOPIC_EVENT "fleetmind/" NODE_ID "/events"
#define TOPIC_COMMAND "fleetmind/" NODE_ID "/commands"
#define TOPIC_SHADOW_DELTA "$aws/things/" NODE_ID "/shadow/update/delta"
#define TOPIC_SHADOW_UPDATE "$aws/things/" NODE_ID "/shadow/update"

struct TelemetryData {
  uint32_t sequence;
  uint32_t epochSeconds;
  uint32_t uptimeMs;
  int gasAdc;
  float gasPpmEstimate;
  float temperatureC;
  float humidityPct;
  bool sensorValid;
  bool anomaly;
};

struct ActuatorCommand {
  char actionId[32];
  bool relayOn;
  bool emergency;
};

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);
DHTesp dht;
QueueHandle_t telemetryQueue;
QueueHandle_t commandQueue;
SemaphoreHandle_t mqttMutex;

volatile bool emergencyInterruptReceived = false;
volatile bool relayOn = false;
volatile uint32_t lastButtonInterruptMs = 0;
bool commandQueueOverflow = false;
uint32_t sequenceNumber = 0;

// An ISR must remain tiny: it only records the event; TaskActuator changes GPIO.
void IRAM_ATTR onEmergencyButtonInterrupt() {
  uint32_t now = millis();
  if (now - lastButtonInterruptMs > 250) {
    emergencyInterruptReceived = true;
    lastButtonInterruptMs = now;
  }
}

uint32_t epochSeconds() {
  time_t now;
  time(&now);
  return now > 1700000000 ? static_cast<uint32_t>(now) : 0;
}

void setRelay(bool enabled) {
  relayOn = enabled;
  bool pinLevel = RELAY_ACTIVE_HIGH ? enabled : !enabled;
  digitalWrite(RELAY_PIN, pinLevel ? HIGH : LOW);
}

bool publishJson(const char* topic, const JsonDocument& document, bool retained = false) {
  char payload[512];
  size_t length = serializeJson(document, payload, sizeof(payload));
  if (length == 0 || !mqtt.connected()) return false;
  xSemaphoreTake(mqttMutex, portMAX_DELAY);
  bool published = mqtt.publish(topic, reinterpret_cast<const uint8_t*>(payload), length, retained);
  xSemaphoreGive(mqttMutex);
  return published;
}

void publishShadowReported(const char* actionId = nullptr) {
  StaticJsonDocument<256> document;
  JsonObject reported = document["state"]["reported"].to<JsonObject>();
  reported["relayOn"] = relayOn;
  reported["fanOn"] = relayOn;
  reported["updatedAt"] = epochSeconds();
  if (actionId != nullptr) reported["lastActionId"] = actionId;
  publishJson(TOPIC_SHADOW_UPDATE, document);
}

void publishActuatorEvent(const ActuatorCommand& command, const char* result) {
  StaticJsonDocument<256> document;
  document["eventType"] = "actuator_ack";
  document["nodeId"] = NODE_ID;
  document["actionId"] = command.actionId;
  document["relayOn"] = relayOn;
  document["emergency"] = command.emergency;
  document["result"] = result;
  document["timestamp"] = epochSeconds();
  publishJson(TOPIC_EVENT, document);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Both an application command and an AWS IoT shadow delta are accepted.
  bool isCommand = strcmp(topic, TOPIC_COMMAND) == 0;
  bool isShadowDelta = strcmp(topic, TOPIC_SHADOW_DELTA) == 0;
  if (!isCommand && !isShadowDelta) return;

  StaticJsonDocument<384> document;
  if (deserializeJson(document, payload, length)) return;

  ActuatorCommand command = {};
  const char* actionId = isShadowDelta
      ? (document["state"]["actionId"] | "shadow-delta")
      : (document["actionId"] | "manual-command");
  strlcpy(command.actionId, actionId, sizeof(command.actionId));
  command.relayOn = isShadowDelta
      ? (document["state"]["relayOn"] | false)
      : (document["relayOn"] | false);
  command.emergency = false;

  // mqttCallback runs inside TaskWiFiMQTT, not an interrupt, so a queue is safe.
  if (xQueueSend(commandQueue, &command, 0) != pdTRUE) commandQueueOverflow = true;
}

bool connectWifiAndTime() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 15000) {
    vTaskDelay(pdMS_TO_TICKS(250));
  }
  if (WiFi.status() != WL_CONNECTED) return false;

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  time_t now = 0;
  for (int attempts = 0; now < 1700000000 && attempts < 40; attempts++) {
    vTaskDelay(pdMS_TO_TICKS(250));
    time(&now);
  }
  return now >= 1700000000;
}

void TaskWiFiMQTT(void* parameter) {
  secureClient.setCACert(AWS_ROOT_CA);
  secureClient.setCertificate(DEVICE_CERT);
  secureClient.setPrivateKey(DEVICE_PRIVATE_KEY);
  mqtt.setServer(AWS_IOT_ENDPOINT, AWS_IOT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);

  uint32_t retryDelayMs = 1000;
  for (;;) {
    if (!connectWifiAndTime()) {
      vTaskDelay(pdMS_TO_TICKS(retryDelayMs));
      retryDelayMs = min(retryDelayMs * 2, 30000UL);
      continue;
    }
    if (!mqtt.connected()) {
      StaticJsonDocument<128> lwt;
      lwt["nodeId"] = NODE_ID;
      lwt["online"] = false;
      char lwtPayload[128];
      serializeJson(lwt, lwtPayload, sizeof(lwtPayload));
      xSemaphoreTake(mqttMutex, portMAX_DELAY);
      bool connected = mqtt.connect(NODE_ID, TOPIC_STATUS, 1, true, lwtPayload);
      xSemaphoreGive(mqttMutex);
      if (!connected) {
        vTaskDelay(pdMS_TO_TICKS(retryDelayMs));
        retryDelayMs = min(retryDelayMs * 2, 30000UL);
        continue;
      }
      retryDelayMs = 1000;
      xSemaphoreTake(mqttMutex, portMAX_DELAY);
      mqtt.subscribe(TOPIC_COMMAND, 1);
      mqtt.subscribe(TOPIC_SHADOW_DELTA, 1);
      xSemaphoreGive(mqttMutex);
      publishShadowReported();
    }
    xSemaphoreTake(mqttMutex, portMAX_DELAY);
    mqtt.loop();
    xSemaphoreGive(mqttMutex);
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

bool isMeaningfulChange(const TelemetryData& current, const TelemetryData& last) {
  return current.anomaly != last.anomaly || current.sensorValid != last.sensorValid ||
         abs(current.gasPpmEstimate - last.gasPpmEstimate) >= GAS_DELTA_PPM ||
         (!isnan(current.temperatureC) && !isnan(last.temperatureC) && abs(current.temperatureC - last.temperatureC) >= TEMP_DELTA_C) ||
         (!isnan(current.humidityPct) && !isnan(last.humidityPct) && abs(current.humidityPct - last.humidityPct) >= HUMIDITY_DELTA_PCT);
}

void TaskSensorRead(void* parameter) {
  TelemetryData lastQueued = {};
  bool hasLastQueued = false;
  uint32_t lastQueuedAt = 0;
  TickType_t nextWake = xTaskGetTickCount();
  for (;;) {
    int gasAdc = analogRead(MQ2_PIN);
    TempAndHumidity dhtReading = dht.getTempAndHumidity();
    bool dhtValid = !isnan(dhtReading.temperature) && !isnan(dhtReading.humidity);
    TelemetryData data = {
      ++sequenceNumber, epochSeconds(), millis(), gasAdc,
      (gasAdc / MQ2_ADC_MAX) * MQ2_ESTIMATED_PPM_AT_FULL_SCALE,
      dhtValid ? dhtReading.temperature : NAN,
      dhtValid ? dhtReading.humidity : NAN,
      dhtValid,
      false
    };
    data.anomaly = data.gasPpmEstimate >= GAS_ANOMALY_PPM ||
                   (dhtValid && data.temperatureC >= TEMP_ANOMALY_C);

    // Edge filtering: publish the first sample, a state/value change, or a
    // periodic proof-of-life. Raw readings still happen every two seconds.
    bool shouldQueue = !hasLastQueued || isMeaningfulChange(data, lastQueued) ||
                       millis() - lastQueuedAt >= MAX_TELEMETRY_SILENCE_MS;
    if (shouldQueue && xQueueSend(telemetryQueue, &data, 0) == pdTRUE) {
      lastQueued = data;
      hasLastQueued = true;
      lastQueuedAt = millis();
    }
    vTaskDelayUntil(&nextWake, pdMS_TO_TICKS(SAMPLE_INTERVAL_MS));
  }
}

void TaskPublish(void* parameter) {
  TelemetryData data;
  for (;;) {
    if (xQueueReceive(telemetryQueue, &data, portMAX_DELAY) != pdTRUE) continue;
    StaticJsonDocument<384> document;
    document["schemaVersion"] = 1;
    document["nodeId"] = NODE_ID;
    document["sequence"] = data.sequence;
    document["timestamp"] = data.epochSeconds;
    document["uptimeMs"] = data.uptimeMs;
    document["gasAdc"] = data.gasAdc;
    document["gasPpmEstimate"] = data.gasPpmEstimate;
    document["temperatureC"] = data.temperatureC;
    document["humidityPct"] = data.humidityPct;
    document["sensorValid"] = data.sensorValid;
    document["isAnomaly"] = data.anomaly;
    document["relayOn"] = relayOn;
    if (publishJson(TOPIC_TELEMETRY, document)) digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }
}

void TaskActuator(void* parameter) {
  ActuatorCommand command;
  for (;;) {
    if (emergencyInterruptReceived) {
      emergencyInterruptReceived = false;
      command = {};
      strlcpy(command.actionId, "physical-emergency-button", sizeof(command.actionId));
      command.relayOn = true;
      command.emergency = true;
    } else if (xQueueReceive(commandQueue, &command, pdMS_TO_TICKS(100)) != pdTRUE) {
      continue;
    }
    setRelay(command.relayOn);
    publishActuatorEvent(command, "applied");
    publishShadowReported(command.actionId);
  }
}

void TaskHeartbeat(void* parameter) {
  esp_task_wdt_add(NULL);
  for (;;) {
    StaticJsonDocument<256> document;
    document["nodeId"] = NODE_ID;
    document["online"] = mqtt.connected();
    document["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
    document["uptimeMs"] = millis();
    document["relayOn"] = relayOn;
    document["commandQueueOverflow"] = commandQueueOverflow;
    publishJson(TOPIC_STATUS, document, true);
    commandQueueOverflow = false;
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false); // Fail-safe boot state: fan/relay is off until commanded.
  pinMode(EMERGENCY_BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(EMERGENCY_BUTTON_PIN), onEmergencyButtonInterrupt, FALLING);
  analogReadResolution(12);
  dht.setup(DHT22_PIN, DHTesp::DHT22);

  telemetryQueue = xQueueCreate(10, sizeof(TelemetryData));
  commandQueue = xQueueCreate(5, sizeof(ActuatorCommand));
  mqttMutex = xSemaphoreCreateMutex();
  if (!telemetryQueue || !commandQueue || !mqttMutex) {
    Serial.println("Fatal: unable to allocate FreeRTOS resources");
    while (true) delay(1000);
  }

  esp_task_wdt_init(30, true); // Arduino-ESP32 2.x API; see README for core 3.x note.
  xTaskCreatePinnedToCore(TaskWiFiMQTT, "WiFiMQTT", 8192, nullptr, 3, nullptr, 0);
  xTaskCreatePinnedToCore(TaskSensorRead, "SensorRead", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(TaskPublish, "Publish", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(TaskActuator, "Actuator", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(TaskHeartbeat, "Heartbeat", 4096, nullptr, 1, nullptr, 1);
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000)); // Work is performed by FreeRTOS tasks.
}
