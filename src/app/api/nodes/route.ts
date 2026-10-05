import { NextRequest, NextResponse } from "next/server";

const nodesStore = [
  { id: "node-01", name: "ESP32 Node 01", status: "online", temperature: 24.2, humidity: 48.5, gasLevel: 310 },
  { id: "node-02", name: "ESP32 Node 02", status: "online", temperature: 25.8, humidity: 52.1, gasLevel: 295 },
];

export async function GET() {
  return NextResponse.json({ nodes: nodesStore });
}

export async function POST(request: NextRequest) {
  const { nodeId, updates } = await request.json();
  const index = nodesStore.findIndex((n) => n.id === nodeId);
  if (index === -1) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  nodesStore[index] = { ...nodesStore[index], ...updates };
  return NextResponse.json({ success: true, node: nodesStore[index] });
}
