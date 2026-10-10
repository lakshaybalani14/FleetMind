export interface AutomationThresholds {
  readonly gasOn: number;
  readonly gasOff: number;
  readonly temperatureOn: number;
  readonly temperatureOff: number;
}

export interface SensorReading {
  readonly gasLevel: number;
  readonly temperature: number;
  readonly isAnomaly?: boolean;
}

export function loadAutomationThresholds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AutomationThresholds | undefined {
  const gasOn = Number(environment.AUTO_GAS_ON_LEVEL);
  const gasOff = Number(environment.AUTO_GAS_OFF_LEVEL);
  const temperatureOn = Number(environment.AUTO_TEMP_ON_C);
  const temperatureOff = Number(environment.AUTO_TEMP_OFF_C);
  if (
    ![gasOn, gasOff, temperatureOn, temperatureOff].every(Number.isFinite) ||
    gasOff < 0 || gasOn < 0 || gasOff > 1000 || gasOn > 1000 ||
    gasOff >= gasOn || temperatureOff >= temperatureOn
  ) return undefined;

  return { gasOn, gasOff, temperatureOn, temperatureOff };
}

export function decideAutomaticRelay(
  reading: SensorReading,
  currentRelayOn: boolean | undefined,
  thresholds: AutomationThresholds,
): boolean | undefined {
  // The inference service can set this flag; threshold rules remain the fallback.
  if (reading.isAnomaly === true) return currentRelayOn === true ? undefined : true;
  const shouldTurnOn = reading.gasLevel >= thresholds.gasOn || reading.temperature >= thresholds.temperatureOn;
  const shouldTurnOff = reading.gasLevel <= thresholds.gasOff && reading.temperature <= thresholds.temperatureOff;
  const desired = shouldTurnOn ? true : shouldTurnOff ? false : undefined;

  // Hysteresis avoids rapid relay toggling; unknown state never triggers an automatic off.
  if (desired === undefined || desired === currentRelayOn || (desired === false && currentRelayOn === undefined)) return undefined;
  return desired;
}
