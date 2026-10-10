"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu } from "lucide-react";
import { useFleetData } from "@/hooks/useFleetData";
import { beginCognitoLogin, clearCognitoSession, cognitoLogoutUrl, getCognitoIdToken } from "@/lib/cognito";
import { FleetPageNavigation } from "@/components/fleet/FleetPageNavigation";
import { NodeSelector } from "@/components/fleet/NodeSelector";
import { TelemetryAnalytics } from "@/components/fleet/TelemetryAnalytics";
import { TelemetrySummaryCards } from "@/components/fleet/TelemetrySummaryCards";

export default function FleetAnalysisPage() {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const { selectedNodeId, setSelectedNodeId, nodes, activeTelemetry, streamState } = useFleetData(idToken);

  useEffect(() => {
    setIdToken(getCognitoIdToken());
    setAuthReady(true);
  }, []);

  if (!authReady) return <main className="min-h-screen bg-[#09090b] p-8 text-zinc-300">Loading FleetMind analytics…</main>;

  if (!idToken) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] p-8 text-zinc-200">
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <Cpu className="mx-auto mb-4 h-8 w-8 text-violet-300" />
          <h1 className="text-2xl font-bold text-white">FleetMind Analytics</h1>
          <p className="mt-2 text-sm text-zinc-400">Sign in with your dashboard account to view telemetry analysis.</p>
          <button
            onClick={() => void beginCognitoLogin().catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Sign-in could not start."))}
            className="mt-6 rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Sign in
          </button>
          {authError && <p className="mt-4 text-sm text-red-400">{authError}</p>}
        </div>
      </main>
    );
  }

  const signOut = () => {
    clearCognitoSession();
    window.location.assign(cognitoLogoutUrl());
  };

  return (
    <FleetPageNavigation current="analysis" streamState={streamState} onSignOut={signOut}>
    <main className="min-h-screen bg-[#09090b] p-4 font-sans text-zinc-200 sm:p-8">
      <header className="mb-8 flex flex-col gap-4 border-b border-zinc-800/80 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-2">
              <Activity className="h-5 w-5 text-violet-300" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Telemetry Analysis</h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Historical trends and prototype alert distribution</p>
        </div>
      </header>

      <div className="mb-5 flex items-center justify-between gap-3" role="group" aria-label="Analysis controls">
        <NodeSelector compact nodes={nodes} selectedNodeId={selectedNodeId} onChange={setSelectedNodeId} />
      </div>

      <div className="mb-8">
        <TelemetrySummaryCards data={activeTelemetry} />
      </div>

      <div className="space-y-6">
        <TelemetryAnalytics data={activeTelemetry} />
      </div>
    </main>
    </FleetPageNavigation>
  );
}
