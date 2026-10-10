const ONLINE_FRESHNESS_WINDOW_MS = 90_000;
const ALLOWED_FUTURE_SKEW_MS = 30_000;

export function canAcceptMqttTelemetry(
  node: { status?: unknown; lastSeen?: unknown } | undefined,
  nowMs = Date.now(),
): boolean {
  if (node?.status !== "online" || typeof node.lastSeen !== "string") return false;
  const lastSeenMs = Date.parse(node.lastSeen);
  if (!Number.isFinite(lastSeenMs)) return false;
  const ageMs = nowMs - lastSeenMs;
  return ageMs <= ONLINE_FRESHNESS_WINDOW_MS && ageMs >= -ALLOWED_FUTURE_SKEW_MS;
}
