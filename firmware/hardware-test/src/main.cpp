/*
 * FleetMind bench test (no AWS credentials or Wi-Fi required).
 *
 * Serial monitor: 115200 baud. Commands: 1 = relay ON, 0 = relay OFF.
 * The relay starts OFF and is never triggered automatically by sensor values.
 */
#include <Arduino.h>
#include <DHTesp.h>

constexpr uint8_t MQ2_PIN = 34;
constexpr uint8_t DHT22_PIN = 4;
constexpr uint8_t RELAY_PIN = 26;
constexpr uint8_t STATUS_LED_PIN = 2;
constexpr bool RELAY_ACTIVE_HIGH = true; // Change to false for active-low relay modules.
constexpr uint32_t SAMPLE_INTERVAL_MS = 2000;

DHTesp dht;
uint32_t lastSampleMs = 0;

void setRelay(bool on) {
  const bool outputHigh = RELAY_ACTIVE_HIGH ? on : !on;
  digitalWrite(RELAY_PIN, outputHigh ? HIGH : LOW);
  Serial.printf("Relay: %s\n", on ? "ON" : "OFF");
}

void handleSerialCommands() {
  while (Serial.available() > 0) {
    const char command = static_cast<char>(Serial.read());
    if (command == '1') setRelay(true);
    else if (command == '0') setRelay(false);
    else if (command != '\r' && command != '\n' && command != ' ')
      Serial.println("Unknown command. Send 1 (relay ON) or 0 (relay OFF).");
  }
}

void printSensorReadings() {
  const int gasAdc = analogRead(MQ2_PIN);
  const TempAndHumidity reading = dht.getTempAndHumidity();
  const bool dhtValid = !isnan(reading.temperature) && !isnan(reading.humidity);

  Serial.printf("MQ-2 ADC (raw): %d / 4095 | ", gasAdc);
  if (dhtValid) {
    Serial.printf("DHT22: %.1f C, %.1f %%RH\n", reading.temperature, reading.humidity);
  } else {
    Serial.println("DHT22: read failed; check VCC, GND, DATA=P4, and pull-up.");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false); // Safe default; test relay manually with serial command 1.
  analogReadResolution(12);
  dht.setup(DHT22_PIN, DHTesp::DHT22);

  Serial.println("FleetMind hardware test ready (no AWS/Wi-Fi required).");
  Serial.println("Pins: MQ-2 AO=P34, DHT22 DATA=P4, relay IN=P26, onboard LED=P2.");
  Serial.println("Send 1 for relay ON or 0 for relay OFF. Relay remains OFF unless commanded.");
  Serial.println("MQ-2 value is raw ADC only; it is not a calibrated gas/PPM reading.");
  Serial.println("Ensure MQ-2 AO at P34 never exceeds 3.3 V; power the sensor per its exact module spec.");
}

void loop() {
  handleSerialCommands();

  const uint32_t now = millis();
  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;
    printSensorReadings();
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }
}
