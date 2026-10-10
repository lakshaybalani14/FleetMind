import { useEffect, useRef } from "react";
import { AlertTriangle, Radio } from "lucide-react";
import type { DashboardAlert } from "@/lib/telemetry-analysis";

interface Props {
  alert: DashboardAlert;
  otherActiveAlerts: number;
  onAcknowledge: () => void;
}

export function HazardAlertOverlay({ alert, otherActiveAlerts, onAcknowledge }: Props) {
  const acknowledgeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => acknowledgeButton.current?.focus(), []);
  return (
    <div
      className="hazard-alert-backdrop fixed inset-0 z-[100] flex h-dvh min-h-dvh items-center justify-center overflow-y-auto px-3 py-3 text-center text-white sm:px-5 sm:py-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="hazard-alert-title"
      aria-describedby="hazard-alert-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onAcknowledge();
        } else if (event.key === "Tab") {
          // Keep keyboard focus inside the modal; the acknowledge button is
          // the only interactive control while the alert is covering the page.
          event.preventDefault();
          acknowledgeButton.current?.focus();
        }
      }}
    >
      <div className="hazard-alert-card relative max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border p-4 shadow-[0_0_100px_rgba(239,68,68,0.3)] backdrop-blur-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <div className="hazard-alert-icon mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/90 bg-white/10 shadow-lg shadow-red-950/40 sm:h-20 sm:w-20">
          <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-[0.24em] text-red-50 sm:mt-4 sm:text-xs">FleetMind prototype monitor</p>
        <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-widest text-red-100 sm:text-xs">{alert.source === "firmware-flag" ? "Firmware anomaly flag" : "Demo threshold crossing"}</p>
        <h2 id="hazard-alert-title" className="mt-1 text-2xl font-black uppercase tracking-wide sm:mt-2 sm:text-4xl">
          Hazard threshold alert
        </h2>
        <p id="hazard-alert-description" className="mt-2 text-base font-semibold text-red-50 sm:text-lg">
          {alert.nodeName} · {alert.nodeId}
        </p>
        <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-white/35 bg-white/10 p-4 text-left shadow-inner shadow-white/5 sm:mt-5 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Radio className="h-4 w-4" aria-hidden="true" /> Trigger details
          </p>
          <ul className="mt-2 space-y-1 text-sm text-white sm:mt-3 sm:space-y-2">
            {alert.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
          </ul>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/30 pt-3 text-center sm:mt-4 sm:pt-4">
            <div><p className="text-[0.65rem] text-red-50 sm:text-xs">MQ-2 relative</p><p className="mt-1 text-sm font-bold sm:text-base">{Math.round(alert.gasLevel)} / 1000</p></div>
            <div><p className="text-[0.65rem] text-red-50 sm:text-xs">Temperature</p><p className="mt-1 text-sm font-bold sm:text-base">{alert.temperature.toFixed(1)} °C</p></div>
            <div><p className="text-[0.65rem] text-red-50 sm:text-xs">Humidity</p><p className="mt-1 text-sm font-bold sm:text-base">{alert.humidity.toFixed(1)}%</p></div>
          </div>
          {otherActiveAlerts > 0 && <p className="mt-4 text-center text-sm font-semibold">+ {otherActiveAlerts} other active node alert{otherActiveAlerts === 1 ? "" : "s"}</p>}
        </div>
        <p className="mx-auto mt-3 max-w-xl text-[0.68rem] leading-relaxed text-red-50 sm:mt-4 sm:text-xs">
          Prototype warning only. MQ-2 is an uncalibrated relative sensor reading, not a CO/ppm measurement or certified life-safety alarm. Do not rely on this dashboard for emergency protection.
        </p>
        <button
          ref={acknowledgeButton}
          type="button"
          onClick={onAcknowledge}
          className="mt-4 min-h-10 rounded-xl border border-white/90 bg-white px-6 py-2 text-sm font-bold text-red-900 shadow-lg transition hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-white/40 sm:mt-5 sm:px-8"
        >
          Acknowledge alert
        </button>
        <p className="mt-2 text-[0.65rem] text-red-50 sm:mt-3 sm:text-xs">The warning clears after readings return below the demo trigger levels.</p>
      </div>
    </div>
  );
}
