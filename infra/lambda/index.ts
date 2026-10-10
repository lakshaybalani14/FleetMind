import { createHash, randomUUID } from "node:crypto";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { decideAutomaticRelay, loadAutomationThresholds } from "./actuator-control";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const tableName = process.env.FLEET_TABLE_NAME;
const bucketName = process.env.HISTORY_BUCKET_NAME;
const websocketTableName = process.env.WEBSOCKET_TABLE_NAME;
const websocketEndpoint = process.env.WEBSOCKET_API_ENDPOINT;
const iotDataEndpoint = process.env.IOT_DATA_ENDPOINT;
const iotData = iotDataEndpoint ? new IoTDataPlaneClient({ endpoint: iotDataEndpoint }) : undefined;
const automaticControlEnabled = process.env.AUTO_CONTROL_ENABLED === "true";
const ttlDays = Number(process.env.TELEMETRY_TTL_DAYS ?? "30");
const websocketManagementClient = websocketEndpoint && process.env.AWS_REGION
  ? new ApiGatewayManagementApiClient({
      endpoint: websocketEndpoint.replace(/^wss:/, "https:"),
      region: process.env.AWS_REGION,
    })
  : undefined;

interface TelemetryInput {
  readonly eventId: string;
  readonly nodeId: string;
  readonly timestamp: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly gasLevel: number;
  readonly gasAdc?: number;
  readonly actuatorState?: {
    readonly relayActive: boolean;
    readonly fanActive: boolean;
    readonly buzzerActive: boolean;
  };
  readonly isAnomaly?: boolean;
}

interface DeviceStatusInput {
  readonly nodeId: string;
  readonly online: boolean;
  readonly relayOn?: boolean;
  readonly rssi?: number;
  readonly uptimeMs?: number;
  readonly commandQueueOverflow?: boolean;
}

interface ActuatorAckInput {
  readonly nodeId: string;
  readonly actionId: string;
  readonly relayOn: boolean;
  readonly result: string;
}

function response(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

// The ESP32 command queue reserves 32 bytes for the action ID including NUL.
function createActionId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 24);
}

function parseTelemetry(body: string | undefined): TelemetryInput | undefined {
  if (!body || body.length > 16_384) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const { eventId, nodeId, timestamp, temperature, humidity, gasLevel } = record;
  const validNumber = (input: unknown): input is number => typeof input === "number" && Number.isFinite(input);
  const gasAdc = record.gasAdc;
  if (
    typeof eventId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(eventId) ||
    typeof nodeId !== "string" || !/^node-[a-zA-Z0-9-]{1,40}$/.test(nodeId) ||
    typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp)) ||
    !validNumber(temperature) || !validNumber(humidity) || !validNumber(gasLevel) || gasLevel < 0 || gasLevel > 1000
  ) return undefined;
  if (gasAdc !== undefined && (!Number.isInteger(gasAdc) || (gasAdc as number) < 0 || (gasAdc as number) > 4095)) return undefined;

  const actuatorState = record.actuatorState;
  let normalizedActuatorState: TelemetryInput["actuatorState"];
  if (actuatorState !== undefined) {
    if (typeof actuatorState !== "object" || actuatorState === null) return undefined;
    const state = actuatorState as Record<string, unknown>;
    if ([state.relayActive, state.fanActive, state.buzzerActive].some((entry) => typeof entry !== "boolean")) return undefined;
    normalizedActuatorState = {
      relayActive: state.relayActive as boolean,
      fanActive: state.fanActive as boolean,
      buzzerActive: state.buzzerActive as boolean,
    };
  }

  if (record.isAnomaly !== undefined && typeof record.isAnomaly !== "boolean") return undefined;

  return {
    eventId,
    nodeId,
    timestamp: new Date(timestamp).toISOString(),
    temperature,
    humidity,
    gasLevel,
    ...(typeof gasAdc === "number" ? { gasAdc } : {}),
    ...(normalizedActuatorState ? { actuatorState: normalizedActuatorState } : {}),
    ...(typeof record.isAnomaly === "boolean" ? { isAnomaly: record.isAnomaly } : {}),
  };
}

function limitFromQuery(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : undefined;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!tableName || !bucketName || !websocketTableName) return response(500, { error: "Backend configuration is incomplete" });

  // AWS IoT Rules invoke this Lambda with the firmware JSON as the event payload.
  if (!(event as APIGatewayProxyEventV2).requestContext?.http) {
    const acknowledgement = parseDeviceActuatorAck(event as unknown as Record<string, unknown>);
    if (acknowledgement) {
      await storeAndBroadcastActuatorAck(acknowledgement);
      return response(202, { accepted: true, nodeId: acknowledgement.nodeId, type: "actuator-ack" });
    }

    const status = parseDeviceStatus(event as unknown as Record<string, unknown>);
    if (status) {
      await storeAndBroadcastStatus(status);
      return response(202, { accepted: true, nodeId: status.nodeId, type: "status" });
    }

    const telemetry = parseDeviceTelemetry(event as unknown as Record<string, unknown>);
    if (!telemetry) {
      console.warn("Ignoring malformed or invalid IoT telemetry payload");
      return response(202, { accepted: false });
    }
    await storeAndBroadcast(telemetry, "AWS IoT Core");
    return response(202, { accepted: true, nodeId: telemetry.nodeId });
  }

  const method = event.requestContext.http.method;
  const route = event.rawPath;

  if (method === "GET" && route === "/nodes") {
    const result = await ddb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :fleet AND begins_with(SK, :nodePrefix)",
      ExpressionAttributeValues: { ":fleet": "FLEET", ":nodePrefix": "NODE#" },
      ScanIndexForward: true,
      Limit: 100,
    }));
    return response(200, { nodes: result.Items ?? [] });
  }

  if (method === "GET" && route === "/telemetry") {
    const nodeId = event.queryStringParameters?.nodeId;
    const limit = limitFromQuery(event.queryStringParameters?.limit, 50);
    if (!nodeId || !/^node-[a-zA-Z0-9-]{1,40}$/.test(nodeId) || limit === undefined) {
      return response(400, { error: "Provide a valid nodeId and limit between 1 and 100" });
    }

    const result = await ddb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :node AND begins_with(SK, :telemetryPrefix)",
      ExpressionAttributeValues: { ":node": `NODE#${nodeId}`, ":telemetryPrefix": "TELEMETRY#" },
      ScanIndexForward: false,
      Limit: limit,
    }));
    return response(200, { nodeId, data: (result.Items ?? []).map(({ PK: _pk, SK: _sk, ...item }) => item) });
  }

  if (method === "GET" && route === "/logs") {
    const limit = limitFromQuery(event.queryStringParameters?.limit, 50);
    if (limit === undefined) return response(400, { error: "limit must be between 1 and 100" });
    const result = await ddb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :fleet AND begins_with(SK, :eventPrefix)",
      ExpressionAttributeValues: { ":fleet": "FLEET", ":eventPrefix": "EVENT#" },
      ScanIndexForward: false,
      Limit: limit,
    }));
    return response(200, { logs: (result.Items ?? []).map(({ PK: _pk, SK: _sk, ...item }) => item) });
  }

  if (method === "POST" && route === "/ws-ticket") {
    const claims = (event.requestContext as typeof event.requestContext & {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    }).authorizer?.jwt?.claims;
    const subject = claims?.sub;
    if (typeof subject !== "string" || !subject) return response(401, { error: "Authenticated user required" });
    const ticket = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    await ddb.send(new PutCommand({
      TableName: websocketTableName,
      Item: { PK: `TICKET#${ticket}`, SK: "TICKET", subject, expiresAt },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return response(201, { ticket, expiresAt });
  }

  const relayRoute = route.match(/^\/nodes\/(node-[a-zA-Z0-9-]{1,40})\/relay$/);
  if (method === "POST" && relayRoute) {
    const body = parseObject(event.body);
    if (!body || typeof body.relayOn !== "boolean") return response(400, { error: "Expected relayOn to be true or false" });
    return requestManualRelay(relayRoute[1], body.relayOn);
  }

  const automationRoute = route.match(/^\/nodes\/(node-[a-zA-Z0-9-]{1,40})\/automation$/);
  if (method === "POST" && automationRoute) {
    const body = parseObject(event.body);
    if (!body || typeof body.enabled !== "boolean") return response(400, { error: "Expected enabled to be true or false" });
    return setNodeAutomation(automationRoute[1], body.enabled);
  }

  if (method === "POST" && route === "/telemetry") {
    const telemetry = parseTelemetry(event.body);
    if (!telemetry) {
      return response(400, {
        error: "Invalid telemetry. Expected eventId, nodeId, ISO timestamp, temperature, humidity, and gasLevel.",
      });
    }

    await storeAndBroadcast(telemetry, "FleetMind API");
    return response(202, { accepted: true, eventId: telemetry.eventId, nodeId: telemetry.nodeId });
  }

  return response(404, { error: "Route not found" });
}

async function storeAndBroadcast(telemetry: TelemetryInput, source: string): Promise<void> {
  if (!tableName || !bucketName || !websocketTableName) throw new Error("Backend configuration is incomplete");
  const timestamp = telemetry.timestamp;
  const receivedAt = new Date().toISOString();
  const date = new Date(timestamp);
  const expiresAt = Math.floor(date.getTime() / 1000) + ttlDays * 24 * 60 * 60;
  const digest = createHash("sha256")
    .update(`${telemetry.nodeId}:${timestamp}:${telemetry.eventId}`)
    .digest("hex");
  const item = {
    PK: `NODE#${telemetry.nodeId}`,
    SK: `TELEMETRY#${timestamp}#${telemetry.eventId}`,
    ...telemetry,
    receivedAt,
    expiresAt,
  };
  const log = {
    PK: "FLEET",
    SK: `EVENT#${timestamp}#${telemetry.nodeId}#${telemetry.eventId}`,
    id: digest.slice(0, 24),
    timestamp,
    nodeId: telemetry.nodeId,
    eventType: "telemetry",
    message: `Telemetry received: MQ-2 relative level ${telemetry.gasLevel}/1000, ${telemetry.temperature}°C`,
    source,
    severity: telemetry.isAnomaly ? "warning" : "info",
    expiresAt,
  };
  const latestNode = {
    PK: "FLEET",
    SK: `NODE#${telemetry.nodeId}`,
    id: telemetry.nodeId,
    name: `ESP32 ${telemetry.nodeId}`,
    status: "online",
    temperature: telemetry.temperature,
    humidity: telemetry.humidity,
    gasLevel: telemetry.gasLevel,
    ...(telemetry.gasAdc !== undefined ? { gasAdc: telemetry.gasAdc } : {}),
    ...(telemetry.actuatorState ? { actuatorState: telemetry.actuatorState } : {}),
    lastSeen: receivedAt,
  };
  const objectKey = `telemetry/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${telemetry.nodeId}/${digest}.json`;

  const updateLatestNode = async (): Promise<void> => {
    const actuatorAssignment = telemetry.actuatorState ? ", actuatorState = :actuatorState" : "";
    const gasAdcAssignment = telemetry.gasAdc !== undefined ? ", gasAdc = :gasAdc" : "";
    const expressionValues: Record<string, unknown> = {
      ":name": latestNode.name,
      ":status": latestNode.status,
      ":temperature": latestNode.temperature,
      ":humidity": latestNode.humidity,
      ":gasLevel": latestNode.gasLevel,
      ":lastSeen": latestNode.lastSeen,
    };
    if (telemetry.gasAdc !== undefined) expressionValues[":gasAdc"] = telemetry.gasAdc;
    if (telemetry.actuatorState) expressionValues[":actuatorState"] = telemetry.actuatorState;

    try {
      await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: "FLEET", SK: `NODE#${telemetry.nodeId}` },
        UpdateExpression: `SET #name = :name, #status = :status, temperature = :temperature, humidity = :humidity, gasLevel = :gasLevel, lastSeen = :lastSeen${gasAdcAssignment}${actuatorAssignment}`,
        ConditionExpression: "attribute_not_exists(lastSeen) OR lastSeen <= :lastSeen",
        ExpressionAttributeNames: { "#name": "name", "#status": "status" },
        ExpressionAttributeValues: expressionValues,
      }));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "ConditionalCheckFailedException") throw error;
    }
  };

  const persistence = Promise.all([
    ddb.send(new PutCommand({ TableName: tableName, Item: item })),
    ddb.send(new PutCommand({ TableName: tableName, Item: log })),
    updateLatestNode(),
    s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: JSON.stringify({ ...telemetry, receivedAt }),
      ContentType: "application/json",
    })),
  ]);
  // Start live delivery alongside storage rather than making the dashboard
  // wait for DynamoDB and S3 writes to finish first.
  await Promise.all([
    persistence,
    broadcastTelemetry({ type: "telemetry", ...telemetry }),
  ]);
  if (source === "AWS IoT Core") await evaluateThresholdAutomation(telemetry.nodeId, telemetry);
}

function parseObject(body: string | undefined): Record<string, unknown> | undefined {
  if (!body || body.length > 4096) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

async function getNode(nodeId: string): Promise<Record<string, unknown> | undefined> {
  if (!tableName) return undefined;
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { PK: "FLEET", SK: `NODE#${nodeId}` },
  }));
  return result.Item;
}

async function publishRelayCommand(
  nodeId: string,
  relayOn: boolean,
  source: "dashboard" | "threshold" | "anomaly",
  actionId = createActionId(),
): Promise<string> {
  if (!iotData) throw new Error("IOT_DATA_ENDPOINT is not configured");
  await iotData.send(new PublishCommand({
    topic: `fleetmind/${nodeId}/commands`,
    qos: 1,
    payload: Buffer.from(JSON.stringify({ actionId, relayOn, source })),
  }));
  return actionId;
}

async function requestManualRelay(nodeId: string, relayOn: boolean): Promise<APIGatewayProxyResultV2> {
  if (!iotData || !tableName) return response(503, { error: "Relay command service is not configured" });
  const node = await getNode(nodeId);
  const lastSeenMs = typeof node?.lastSeen === "string" ? Date.parse(node.lastSeen) : Number.NaN;
  if (node?.status !== "online" || !Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > 90_000) {
    return response(409, { error: "Node is offline or its status is stale; relay command was not sent" });
  }

  const actionId = createActionId();
  await ddb.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: "FLEET", SK: `NODE#${nodeId}` },
    UpdateExpression: "SET automationEnabled = :disabled, controlMode = :manual, pendingActionId = :actionId, pendingRelayOn = :relayOn",
    ExpressionAttributeValues: {
      ":disabled": false,
      ":manual": "manual",
      ":actionId": actionId,
      ":relayOn": relayOn,
    },
  }));

  try {
    await publishRelayCommand(nodeId, relayOn, "dashboard", actionId);
  } catch (error) {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: "FLEET", SK: `NODE#${nodeId}` },
      UpdateExpression: "REMOVE pendingActionId, pendingRelayOn",
    }));
    console.error("Could not publish manual relay command", error);
    return response(502, { error: "AWS IoT Core could not accept the relay command" });
  }

  await broadcastTelemetry({ type: "control-mode", nodeId, automationEnabled: false, timestamp: new Date().toISOString() });
  return response(202, { accepted: true, actionId, nodeId, relayOn, awaitingDeviceAck: true });
}

async function setNodeAutomation(nodeId: string, enabled: boolean): Promise<APIGatewayProxyResultV2> {
  if (!tableName) return response(503, { error: "Fleet table is not configured" });
  if (enabled && (!automaticControlEnabled || !loadAutomationThresholds())) {
    return response(409, { error: "Automatic thresholds are not configured; automation remains off" });
  }
  const node = await getNode(nodeId);
  if (!node) return response(404, { error: "Node not found" });
  if (enabled) {
    const lastSeenMs = typeof node.lastSeen === "string" ? Date.parse(node.lastSeen) : Number.NaN;
    if (node.status !== "online" || !Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > 90_000) {
      return response(409, { error: "Node is offline or its status is stale; automatic control was not enabled" });
    }
  }

  await ddb.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: "FLEET", SK: `NODE#${nodeId}` },
    UpdateExpression: "SET automationEnabled = :enabled, controlMode = :mode",
    ExpressionAttributeValues: { ":enabled": enabled, ":mode": enabled ? "automatic" : "manual" },
  }));
  await broadcastTelemetry({ type: "control-mode", nodeId, automationEnabled: enabled, timestamp: new Date().toISOString() });

  if (enabled) {
    const node = await getNode(nodeId);
    if (node && typeof node.gasLevel === "number" && typeof node.temperature === "number") {
      await evaluateThresholdAutomation(nodeId, {
        gasLevel: node.gasLevel,
        temperature: node.temperature,
        ...(typeof node.isAnomaly === "boolean" ? { isAnomaly: node.isAnomaly } : {}),
      });
    }
  }
  return response(200, { nodeId, automationEnabled: enabled, controlMode: enabled ? "automatic" : "manual" });
}

async function evaluateThresholdAutomation(nodeId: string, reading: Pick<TelemetryInput, "gasLevel" | "temperature" | "isAnomaly">): Promise<void> {
  if (!automaticControlEnabled || !iotData || !tableName) return;
  const thresholds = loadAutomationThresholds();
  if (!thresholds) return;
  const node = await getNode(nodeId);
  if (node?.automationEnabled !== true) return;
  const actuatorState = typeof node.actuatorState === "object" && node.actuatorState !== null
    ? node.actuatorState as Record<string, unknown>
    : undefined;
  const currentRelayOn = typeof actuatorState?.relayActive === "boolean" ? actuatorState.relayActive : undefined;
  const desiredRelayOn = decideAutomaticRelay(reading, currentRelayOn, thresholds);
  if (desiredRelayOn === undefined) return;

  const now = new Date();
  const cooldownSeconds = Number(process.env.AUTO_COMMAND_COOLDOWN_SECONDS ?? "10");
  const safeCooldownSeconds = Number.isFinite(cooldownSeconds) && cooldownSeconds >= 1 && cooldownSeconds <= 3600
    ? cooldownSeconds
    : 10;
  const cutoff = new Date(now.getTime() - safeCooldownSeconds * 1000).toISOString();
    const actionId = createActionId();
  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: "FLEET", SK: `NODE#${nodeId}` },
      UpdateExpression: "SET automationLastCommandAt = :now, automationLastActionId = :actionId, pendingActionId = :actionId, pendingRelayOn = :relayOn",
      ConditionExpression: "automationEnabled = :enabled AND (attribute_not_exists(automationLastCommandAt) OR automationLastCommandAt <= :cutoff)",
      ExpressionAttributeValues: {
        ":now": now.toISOString(),
        ":cutoff": cutoff,
        ":actionId": actionId,
        ":relayOn": desiredRelayOn,
        ":enabled": true,
      },
    }));
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") return;
    throw error;
  }

  try {
    await publishRelayCommand(nodeId, desiredRelayOn, reading.isAnomaly ? "anomaly" : "threshold", actionId);
  } catch (error) {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: "FLEET", SK: `NODE#${nodeId}` },
      UpdateExpression: "REMOVE pendingActionId, pendingRelayOn",
      ConditionExpression: "pendingActionId = :actionId",
      ExpressionAttributeValues: { ":actionId": actionId },
    }));
    console.error("Could not publish automatic relay command", { nodeId, actionId, error });
  }
}

async function storeAndBroadcastStatus(status: DeviceStatusInput): Promise<void> {
  if (!tableName || !websocketTableName) throw new Error("Backend configuration is incomplete");
  const receivedAt = new Date().toISOString();
  const values: Record<string, unknown> = {
    ":name": `ESP32 ${status.nodeId}`,
    ":status": status.online ? "online" : "offline",
    ":lastSeen": receivedAt,
  };
  const assignments = ["#name = :name", "#status = :status", "lastSeen = :lastSeen"];

  if (status.relayOn !== undefined) {
    assignments.push("actuatorState = :actuatorState");
    values[":actuatorState"] = {
      relayActive: status.relayOn,
      fanActive: status.relayOn,
      buzzerActive: false,
    };
  }
  if (status.rssi !== undefined) {
    assignments.push("rssi = :rssi");
    values[":rssi"] = status.rssi;
  }
  if (status.uptimeMs !== undefined) {
    assignments.push("uptimeMs = :uptimeMs");
    values[":uptimeMs"] = status.uptimeMs;
  }
  if (status.commandQueueOverflow !== undefined) {
    assignments.push("commandQueueOverflow = :commandQueueOverflow");
    values[":commandQueueOverflow"] = status.commandQueueOverflow;
  }

  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: "FLEET", SK: `NODE#${status.nodeId}` },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ConditionExpression: "attribute_not_exists(lastSeen) OR lastSeen <= :lastSeen",
      ExpressionAttributeNames: { "#name": "name", "#status": "status" },
      ExpressionAttributeValues: values,
    }));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "ConditionalCheckFailedException") throw error;
  }

  await broadcastTelemetry({
    type: "node-status",
    nodeId: status.nodeId,
    online: status.online,
    timestamp: receivedAt,
    ...(status.relayOn !== undefined ? { relayOn: status.relayOn } : {}),
    ...(status.rssi !== undefined ? { rssi: status.rssi } : {}),
    ...(status.uptimeMs !== undefined ? { uptimeMs: status.uptimeMs } : {}),
    ...(status.commandQueueOverflow !== undefined ? { commandQueueOverflow: status.commandQueueOverflow } : {}),
  });
}

async function storeAndBroadcastActuatorAck(ack: ActuatorAckInput): Promise<void> {
  if (!tableName) throw new Error("Fleet table is not configured");
  const receivedAt = new Date().toISOString();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const actuatorState = {
    relayActive: ack.relayOn,
    fanActive: ack.relayOn,
    buzzerActive: false,
  };
  await Promise.all([
    ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: "FLEET", SK: `NODE#${ack.nodeId}` },
      UpdateExpression: "SET actuatorState = :actuatorState, lastActuatorActionId = :actionId, lastActuatorActionResult = :result",
      ExpressionAttributeValues: {
        ":actuatorState": actuatorState,
        ":actionId": ack.actionId,
        ":result": ack.result,
      },
    })),
    ddb.send(new PutCommand({
      TableName: tableName,
      Item: {
        PK: "FLEET",
        SK: `EVENT#${receivedAt}#${ack.nodeId}#${ack.actionId}`,
        id: ack.actionId,
        timestamp: receivedAt,
        nodeId: ack.nodeId,
        eventType: "actuator_command",
        message: `Relay ${ack.relayOn ? "on" : "off"}: ${ack.result}`,
        source: "AWS IoT Core",
        severity: ack.result === "applied" ? "info" : "warning",
        expiresAt,
      },
    })),
  ]);
  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: "FLEET", SK: `NODE#${ack.nodeId}` },
      UpdateExpression: "REMOVE pendingActionId, pendingRelayOn",
      ConditionExpression: "pendingActionId = :actionId",
      ExpressionAttributeValues: { ":actionId": ack.actionId },
    }));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "ConditionalCheckFailedException") throw error;
  }
  await broadcastTelemetry({
    type: "actuator-ack",
    nodeId: ack.nodeId,
    actionId: ack.actionId,
    relayOn: ack.relayOn,
    result: ack.result,
    timestamp: receivedAt,
  });
}

function parseDeviceActuatorAck(record: Record<string, unknown>): ActuatorAckInput | undefined {
  const { eventType, nodeId, actionId, relayOn, result } = record;
  if (
    eventType !== "actuator_ack" ||
    typeof nodeId !== "string" || !/^node-[a-zA-Z0-9-]{1,40}$/.test(nodeId) ||
    typeof actionId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(actionId) ||
    typeof relayOn !== "boolean" || typeof result !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(result)
  ) return undefined;
  return { nodeId, actionId, relayOn, result };
}

function parseDeviceStatus(record: Record<string, unknown>): DeviceStatusInput | undefined {
  const { nodeId, online, relayOn, rssi, uptimeMs, commandQueueOverflow } = record;
  const validNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (
    typeof nodeId !== "string" || !/^node-[a-zA-Z0-9-]{1,40}$/.test(nodeId) ||
    typeof online !== "boolean" ||
    (relayOn !== undefined && typeof relayOn !== "boolean") ||
    (rssi !== undefined && !validNumber(rssi)) ||
    (uptimeMs !== undefined && (!validNumber(uptimeMs) || uptimeMs < 0)) ||
    (commandQueueOverflow !== undefined && typeof commandQueueOverflow !== "boolean")
  ) return undefined;

  return {
    nodeId,
    online,
    ...(typeof relayOn === "boolean" ? { relayOn } : {}),
    ...(validNumber(rssi) ? { rssi } : {}),
    ...(validNumber(uptimeMs) ? { uptimeMs } : {}),
    ...(typeof commandQueueOverflow === "boolean" ? { commandQueueOverflow } : {}),
  };
}

function parseDeviceTelemetry(record: Record<string, unknown>): TelemetryInput | undefined {
  const nodeId = record.nodeId;
  const sequence = record.sequence;
  const timestampValue = record.timestamp;
  const temperature = record.temperatureC;
  const humidity = record.humidityPct;
  // gasLevelEstimate is the current contract. Accept gasPpmEstimate temporarily
  // so older deployed firmware continues to publish during staged updates.
  const gasLevel = record.gasLevelEstimate ?? record.gasPpmEstimate;
  const gasAdc = record.gasAdc;
  if (
    record.sensorValid !== true || typeof nodeId !== "string" ||
    !Number.isInteger(sequence) || typeof timestampValue !== "number" || !Number.isFinite(timestampValue) ||
    !Number.isFinite(temperature) || !Number.isFinite(humidity) || !Number.isFinite(gasLevel)
  ) return undefined;
  const timestamp = timestampValue > 0
    ? new Date(timestampValue * 1000).toISOString()
    : new Date().toISOString();
  return parseTelemetry(JSON.stringify({
    eventId: String(sequence), nodeId,
    timestamp,
    temperature, humidity, gasLevel,
    ...(Number.isInteger(gasAdc) && (gasAdc as number) >= 0 && (gasAdc as number) <= 4095 ? { gasAdc } : {}),
    isAnomaly: record.isAnomaly === true,
    actuatorState: { relayActive: record.relayOn === true, fanActive: record.relayOn === true, buzzerActive: false },
  }));
}

async function broadcastTelemetry(payload: unknown): Promise<void> {
  if (!websocketTableName || !websocketEndpoint) return;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new QueryCommand({
      TableName: websocketTableName,
      KeyConditionExpression: "PK = :connections",
      ExpressionAttributeValues: { ":connections": "CONNECTION" },
      ExclusiveStartKey: lastKey,
    }));
    await Promise.all((page.Items ?? []).map(async (connection) => {
      const connectionId = connection.connectionId;
      if (typeof connectionId !== "string") return;
      try {
        await postToWebSocket(connectionId, JSON.stringify(payload));
      } catch (error) {
        const status = typeof error === "object" && error !== null && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
        if (status === 410 || (error instanceof Error && error.name === "GoneException")) {
          await ddb.send(new DeleteCommand({ TableName: websocketTableName, Key: { PK: "CONNECTION", SK: connectionId } }));
        } else {
          console.error("WebSocket delivery failed", {
            connectionId,
            status,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
}

async function postToWebSocket(connectionId: string, body: string): Promise<void> {
  if (!websocketManagementClient) throw new Error("WebSocket management client is not configured");
  await websocketManagementClient.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(body),
  }));
}

interface WsEvent {
  readonly queryStringParameters?: Record<string, string | undefined> | null;
  readonly methodArn?: string;
  readonly requestContext: {
    readonly routeKey: string;
    readonly connectionId?: string;
    readonly domainName?: string;
    readonly stage?: string;
    readonly authorizer?: { readonly principalId?: string };
  };
}

export async function websocketAuthorizer(event: WsEvent): Promise<unknown> {
  if (!websocketTableName) throw new Error("WebSocket ticket store is not configured");
  const ticket = event.queryStringParameters?.ticket;
  if (!ticket || !/^[0-9a-f-]{36}$/i.test(ticket)) throw new Error("Unauthorized");
  const result = await ddb.send(new DeleteCommand({
    TableName: websocketTableName,
    Key: { PK: `TICKET#${ticket}`, SK: "TICKET" },
    ReturnValues: "ALL_OLD",
  }));
  const item = result.Attributes;
  if (!item || typeof item.expiresAt !== "number" || item.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("Unauthorized");
  }
  return {
    principalId: typeof item.subject === "string" ? item.subject : "fleetmind-user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "execute-api:Invoke", Resource: event.methodArn ?? "*" }],
    },
  };
}

export async function websocketConnect(event: WsEvent): Promise<APIGatewayProxyResultV2> {
  if (!websocketTableName || !event.requestContext.connectionId) return response(400, { error: "Missing connection context" });
  const connectionId = event.requestContext.connectionId;
  await ddb.send(new PutCommand({
    TableName: websocketTableName,
    Item: {
      PK: "CONNECTION", SK: connectionId, connectionId,
      subject: event.requestContext.authorizer?.principalId ?? "fleetmind-user",
      expiresAt: Math.floor(Date.now() / 1000) + 3 * 60 * 60,
    },
  }));
  return response(200, { connected: true });
}

export async function websocketDisconnect(event: WsEvent): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  if (websocketTableName && connectionId) {
    await ddb.send(new DeleteCommand({ TableName: websocketTableName, Key: { PK: "CONNECTION", SK: connectionId } }));
  }
  return response(200, { disconnected: true });
}
