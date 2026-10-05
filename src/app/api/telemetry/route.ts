import { NextRequest, NextResponse } from "next/server";

const telemetryStore: Record<string, any[]> = {};

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return NextResponse.json({ error: "nodeId required" }, { status: 400 });
  return NextResponse.json({ nodeId, data: telemetryStore[nodeId] || [] });
}

export async function POST(request: NextRequest) {
  const { nodeId, telemetry } = await request.json();
  if (!nodeId || !telemetry) return NextResponse.json({ error: "nodeId and telemetry required" }, { status: 400 });
  if (!telemetryStore[nodeId]) telemetryStore[nodeId] = [];
  telemetryStore[nodeId].push(telemetry);
  if (telemetryStore[nodeId].length > 100) telemetryStore[nodeId] = telemetryStore[nodeId].slice(-100);
  return NextResponse.json({ success: true });
}
