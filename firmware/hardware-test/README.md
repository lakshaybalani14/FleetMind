# FleetMind hardware test

This standalone PlatformIO project checks the ESP32 wiring without AWS IoT credentials or Wi-Fi. It prints DHT22 values and the MQ-2 raw ADC count to Serial every two seconds. The relay starts OFF and is controlled manually through Serial (`1` = ON, `0` = OFF), so a sensor reading cannot unexpectedly start the fan.

## Wiring

| Part | ESP32 board label | Notes |
| --- | --- | --- |
| MQ-2 AO | P34 | Raw ADC only; AO must never exceed 3.3 V. Use only a module/output verified safe for the ESP32. |
| DHT22 DATA | P4 | VCC to 3V3, GND to GND; breakout should include a pull-up, otherwise add 4.7k–10k to 3V3. |
| Relay IN | P26 | Relay logic must accept 3.3 V. Relay starts OFF. |
| Onboard LED | P2 | Blinks at each sensor sample if the board has an LED on P2. |
| Common ground | GND | Grounds must be common unless the relay input is specifically isolated and wired per its datasheet. |

Power the MQ-2 and relay according to their exact module specifications. A standard MQ-2 sensing element has a 5 V heater; do not assume 3.3 V gives valid operation. Never feed more than 3.3 V into ESP32 P34. Do not connect a fan to an ESP32 pin; initially test relay switching without a fan, then use an appropriate separate low-voltage supply through the relay contacts. No mains wiring.

## Build and upload

1. In VS Code, choose **File → Open Folder** and open `firmware/hardware-test`.
2. Wait for PlatformIO to finish installing the ESP32 platform/framework and DHT library.
3. Build with the PlatformIO checkmark. Upload only after the build succeeds and the wiring has been checked.
4. Open the PlatformIO Serial Monitor at **115200 baud**. It should print sensor values. Type `1` then Enter to energize the relay; type `0` then Enter to turn it off.

This test sketch deliberately does not estimate gas PPM or infer that a particular raw ADC value means an alarm. MQ-2 requires warm-up and calibration for meaningful gas measurements.
