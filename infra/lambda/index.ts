import { createHash, randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const tableName = process.env.FLEET_TABLE_NAME;
const bucketName = process.env.HISTORY_BUCKET_NAME;
const websocketTableName = process.env.WEBSOCKET_TABLE_NAME;
const websocketEndpoint = process.env.WEBSOCKET_API_ENDPOINT;
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
  if (!tableName || !bucketName || !websocketTableName) return response(500, { error: "Backend configuration is incomplete" });

  // AWS IoT Rules invoke this Lambda with the firmware JSON as the event payload.
  if (!(event as APIGatewayProxyEventV2).requestContext?.http) {
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
  await broadcastTelemetry({ type: "telemetry", ...telemetry });
}

function parseDeviceTelemetry(record: Record<string, unknown>): TelemetryInput | undefined {
  const nodeId = record.nodeId;
  const sequence = record.sequence;
  const timestampValue = record.timestamp;
  const temperature = record.temperatureC;
  const humidity = record.humidityPct;
  const gasLevel = record.gasPpmEstimate;
  if (
    record.sensorValid !== true || typeof nodeId !== "string" ||
    !Number.isInteger(sequence) || typeof timestampValue !== "number" ||
    !Number.isFinite(temperature) || !Number.isFinite(humidity) || !Number.isFinite(gasLevel)
  ) return undefined;
  return parseTelemetry(JSON.stringify({
    eventId: String(sequence), nodeId,
    timestamp: new Date(timestampValue * 1000).toISOString(),
    temperature, humidity, gasLevel,
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
        const result = await postToWebSocket(connectionId, JSON.stringify(payload));
        if (result.status === 410) {
          await ddb.send(new DeleteCommand({ TableName: websocketTableName, Key: { PK: "CONNECTION", SK: connectionId } }));
        } else if (!result.ok) {
          console.error("WebSocket delivery failed", { connectionId, status: result.status });
        }
      } catch (error) {
        console.error("WebSocket delivery failed", { connectionId, error });
      }
    }));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
}

async function postToWebSocket(connectionId: string, body: string): Promise<Response> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const region = process.env.AWS_REGION;
  if (!accessKeyId || !secretAccessKey || !sessionToken || !region || !websocketEndpoint) {
    throw new Error("Lambda execution credentials or WebSocket endpoint are unavailable");
  }
  const endpoint = new URL(websocketEndpoint.replace(/^wss:/, "https:"));
  const path = `${endpoint.pathname.replace(/\/$/, "")}/@connections/${encodeURIComponent(connectionId)}`;
  const host = endpoint.host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token";
  const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/execute-api/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), "execute-api"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "x-amz-security-token": sessionToken,
      authorization,
    },
    body,
  });
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
