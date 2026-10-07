export interface TelemetryPoint {
  timestamp: string;
  temperature: number;
  humidity: number;
  gasLevel: number;
  isAnomaly: boolean;
}

export interface FleetNode {
  id: string;
  name: string;
  status: "online" | "degraded" | "offline";
  temperature: number;
  humidity: number;
  gasLevel: number;
  actuatorState: {
    relayActive: boolean;
    fanActive: boolean;
    buzzerActive: boolean;
  };
  lastSeen: string;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  nodeId: string;
  eventType: "telemetry" | "anomaly_detected" | "actuator_command" | "shadow_update";
  message: string;
  source: "ESP32 FreeRTOS" | "AWS IoT Core" | "AWS Lambda ML" | "FleetMind API" | "Next.js App";
  severity: "info" | "warning" | "critical";
}
