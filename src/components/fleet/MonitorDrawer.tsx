"use client";

import { useEffect, useRef } from "react";
import { Activity, AlertTriangle, X } from "lucide-react";
import { ActionLog } from "@/components/fleet/ActionLog";
import type { DashboardAlert } from "@/lib/telemetry-analysis";
import type { ActionLogEntry } from "@/types/fleet";

interface Props {
  open: boolean;
  activeAlerts: DashboardAlert[];
  logs: ActionLogEntry[];
  onClose: () => void;
}

export function MonitorDrawer({ open, activeAlerts, logs, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close alerts and activity drawer"
      />
      <aside
        className="monitor-drawer-enter absolute right-0 top-0 flex h-dvh w-full max-w-xl flex-col border-l border-zinc-700 bg-[#101014] text-zinc-200 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitor-drawer-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <h2 id="monitor-drawer-title" className="flex items-center gap-2 text-lg font-bold text-white">
              <Activity className="h-5 w-5 text-blue-300" aria-hidden="true" />
              Alerts & activity
            </h2>
            <p className="mt-1 text-xs text-zinc-400">Live alerts and recent fleet events</p>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label="Close drawer">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="scroll-fade min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section aria-labelledby="drawer-alerts-title">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="drawer-alerts-title" className="flex items-center gap-2 text-sm font-semibold text-red-200">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Active alerts
              </h3>
              <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-200">{activeAlerts.length}</span>
            </div>
            {activeAlerts.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">No active prototype alerts.</p>
            ) : (
              <ul className="space-y-3">
                {activeAlerts.map((alert) => (
                  <li key={alert.key} className="rounded-xl border border-red-500/30 bg-red-950/35 p-4">
                    <p className="text-sm font-semibold text-red-100">{alert.nodeName} · {alert.nodeId}</p>
                    <p className="mt-1 text-[11px] text-red-200/70">{alert.source === "firmware-flag" ? "Firmware anomaly flag" : "Demo threshold crossing"}</p>
                    <ul className="mt-3 space-y-1 text-xs leading-relaxed text-zinc-200">
                      {alert.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                    </ul>
                    <p className="mt-3 border-t border-red-300/10 pt-3 text-[11px] text-zinc-400">
                      MQ-2 {Math.round(alert.gasLevel)}/1000 · {alert.temperature.toFixed(1)} °C · {alert.humidity.toFixed(1)}% humidity
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Recent activity log">
            <ActionLog logs={logs} />
          </section>
        </div>
      </aside>
    </div>
  );
}
