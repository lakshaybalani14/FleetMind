import type { FleetNode, TelemetryPoint } from "@/types/fleet";

// These values mirror the prototype demo thresholds documented for the current
// firmware. They are dashboard warnings, not calibrated gas/safety limits.
export const DEMO_ALERT_THRESHOLDS = {
  gasLevelOn: 400,
  temperatureOn: 60,
} as const;

type Reading = Pick<FleetNode, "id" | "gasLevel" | "temperature" | "humidity"> & {
  isAnomaly?: boolean;
  lastSeen?: string;
};

export interface DashboardAlert {
  key: string;
  nodeId: string;
  nodeName: string;
  timestamp: string;
  gasLevel: number;
  temperature: number;
  humidity: number;
  reasons: string[];
  source: "firmware-flag" | "demo-threshold";
}

export function demoThresholdReasons(reading: Pick<Reading, "gasLevel" | "temperature">): string[] {
  const reasons: string[] = [];
  if (reading.gasLevel >= DEMO_ALERT_THRESHOLDS.gasLevelOn) {
    reasons.push(`MQ-2 relative level reached ${Math.round(reading.gasLevel)} / 1000 (demo trigger 400)`);
  }
  if (reading.temperature >= DEMO_ALERT_THRESHOLDS.temperatureOn) {
    reasons.push(`Temperature reached ${reading.temperature.toFixed(1)} °C (demo trigger 60 °C)`);
  }
  return reasons;
}

export function dashboardAlertForNode(node: FleetNode): DashboardAlert | undefined {
  // A stale last reading is still useful in history, but it must not be shown
  // as a live hazard alert after the node goes offline.
  if (node.status !== "online") return undefined;
  const reasons = demoThresholdReasons(node);
  if (node.isAnomaly && reasons.length === 0) reasons.push("Firmware reported an anomaly flag");
  if (reasons.length === 0 && !node.isAnomaly) return undefined;
  return {
    key: `${node.id}:prototype-alert`,
    nodeId: node.id,
    nodeName: node.name,
    timestamp: node.lastSeen,
    gasLevel: node.gasLevel,
    temperature: node.temperature,
    humidity: node.humidity,
    reasons,
    source: node.isAnomaly ? "firmware-flag" : "demo-threshold",
  };
}

export interface TelemetrySummary {
  count: number;
  alertCount: number;
  gasMin: number;
  gasMax: number;
  gasAverage: number;
  gasDelta: number;
  temperatureMin: number;
  temperatureMax: number;
  temperatureAverage: number;
  temperatureDelta: number;
  humidityAverage: number;
}

export function summarizeTelemetry(points: TelemetryPoint[]): TelemetrySummary | undefined {
  if (points.length === 0) return undefined;
  const ordered = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  const gasValues = ordered.map((point) => point.gasLevel);
  const temperatureValues = ordered.map((point) => point.temperature);
  const humidityValues = ordered.map((point) => point.humidity);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: ordered.length,
    alertCount: ordered.filter((point) => point.isAnomaly || demoThresholdReasons(point).length > 0).length,
    gasMin: Math.min(...gasValues),
    gasMax: Math.max(...gasValues),
    gasAverage: average(gasValues),
    gasDelta: gasValues[gasValues.length - 1] - gasValues[0],
    temperatureMin: Math.min(...temperatureValues),
    temperatureMax: Math.max(...temperatureValues),
    temperatureAverage: average(temperatureValues),
    temperatureDelta: temperatureValues[temperatureValues.length - 1] - temperatureValues[0],
    humidityAverage: average(humidityValues),
  };
}
