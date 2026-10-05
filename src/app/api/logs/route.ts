import { NextRequest, NextResponse } from "next/server";

const logsStore: any[] = [];

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
  return NextResponse.json({ logs: logsStore.slice(0, limit) });
}

export async function POST(request: NextRequest) {
  const { log } = await request.json();
  if (!log) return NextResponse.json({ error: "log required" }, { status: 400 });
  logsStore.unshift({ ...log, id: `log-${Date.now()}` });
  if (logsStore.length > 100) logsStore.splice(100);
  return NextResponse.json({ success: true, log });
}
