import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const tableName = process.env.FLEET_TABLE_NAME;
const bucketName = process.env.HISTORY_BUCKET_NAME;
const ttlDays = Number(process.env.TELEMETRY_TTL_DAYS ?? "30");

interface TelemetryInput {
  readonly eventId: string;
  readonly nodeId: string;
  readonly timestamp: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly gasLevel: number;
  readonly actuatorState?: {
    readonly relayActive: boolean;
    readonly fanActive: boolean;
    readonly buzzerActive: boolean;
  };
  readonly isAnomaly?: boolean;
}

function response(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
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
  if (
    typeof eventId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(eventId) ||
    typeof nodeId !== "string" || !/^node-[a-zA-Z0-9-]{1,40}$/.test(nodeId) ||
    typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp)) ||
    !validNumber(temperature) || !validNumber(humidity) || !validNumber(gasLevel)
  ) return undefined;

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
  if (!tableName || !bucketName) return response(500, { error: "Backend configuration is incomplete" });

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

  if (method === "POST" && route === "/telemetry") {
    const telemetry = parseTelemetry(event.body);
    if (!telemetry) {
      return response(400, {
        error: "Invalid telemetry. Expected eventId, nodeId, ISO timestamp, temperature, humidity, and gasLevel.",
      });
    }

    const timestamp = telemetry.timestamp;
    const date = new Date(timestamp);
    const expiresAt = Math.floor(date.getTime() / 1000) + ttlDays * 24 * 60 * 60;
    const digest = createHash("sha256")
      .update(`${telemetry.nodeId}:${timestamp}:${telemetry.eventId}`)
      .digest("hex");
    const item = {
      PK: `NODE#${telemetry.nodeId}`,
      SK: `TELEMETRY#${timestamp}#${telemetry.eventId}`,
      ...telemetry,
      expiresAt,
    };
    const log = {
      PK: "FLEET",
      SK: `EVENT#${timestamp}#${telemetry.nodeId}#${telemetry.eventId}`,
      id: digest.slice(0, 24),
      timestamp,
      nodeId: telemetry.nodeId,
      eventType: "telemetry",
      message: `Telemetry received: ${telemetry.gasLevel} PPM gas, ${telemetry.temperature}°C`,
      source: "FleetMind API",
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
      ...(telemetry.actuatorState ? { actuatorState: telemetry.actuatorState } : {}),
      lastSeen: timestamp,
    };
    const objectKey = `telemetry/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${telemetry.nodeId}/${digest}.json`;

    const updateLatestNode = async (): Promise<void> => {
      const actuatorAssignment = telemetry.actuatorState ? ", actuatorState = :actuatorState" : "";
      const expressionValues: Record<string, unknown> = {
        ":name": latestNode.name,
        ":status": latestNode.status,
        ":temperature": latestNode.temperature,
        ":humidity": latestNode.humidity,
        ":gasLevel": latestNode.gasLevel,
        ":lastSeen": latestNode.lastSeen,
      };
      if (telemetry.actuatorState) expressionValues[":actuatorState"] = telemetry.actuatorState;

      try {
        await ddb.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: "FLEET", SK: `NODE#${telemetry.nodeId}` },
          UpdateExpression: `SET #name = :name, #status = :status, temperature = :temperature, humidity = :humidity, gasLevel = :gasLevel, lastSeen = :lastSeen${actuatorAssignment}`,
          ConditionExpression: "attribute_not_exists(lastSeen) OR lastSeen <= :lastSeen",
          ExpressionAttributeNames: { "#name": "name", "#status": "status" },
          ExpressionAttributeValues: expressionValues,
        }));
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "ConditionalCheckFailedException") throw error;
      }
    };

    await Promise.all([
      ddb.send(new PutCommand({ TableName: tableName, Item: item })),
      ddb.send(new PutCommand({ TableName: tableName, Item: log })),
      updateLatestNode(),
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: JSON.stringify({ ...telemetry, receivedAt: new Date().toISOString() }),
        ContentType: "application/json",
      })),
    ]);

    return response(202, { accepted: true, eventId: telemetry.eventId, nodeId: telemetry.nodeId });
  }

  return response(404, { error: "Route not found" });
}
