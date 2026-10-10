"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, ChevronsLeft, ChevronsRight, Cpu, LogOut, Wifi } from "lucide-react";

interface Props {
  current: "monitoring" | "analysis";
  streamState: "connected" | "connecting" | "disconnected" | string;
  onSignOut: () => void;
  children: ReactNode;
}

export function FleetPageNavigation({ current, streamState, onSignOut, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setCollapsed(true);
  }, []);

  const links = [
    { href: "/", label: "Monitoring", icon: Cpu, key: "monitoring" as const },
    { href: "/analysis", label: "Analysis", icon: Activity, key: "analysis" as const },
  ];

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-200">
      <aside
        className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-zinc-800 bg-[#0c0c0e] transition-[width] duration-200 ${collapsed ? "w-[68px]" : "w-[240px]"}`}
        aria-label="FleetMind sidebar"
      >
        <div className={`flex shrink-0 items-center border-b border-zinc-800 ${collapsed ? "h-[88px] flex-col justify-center gap-1 px-2" : "h-[68px] justify-between px-4"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300" aria-hidden="true">
              <Cpu className="h-[18px] w-[18px]" />
            </span>
            {!collapsed && <span className="truncate text-sm font-semibold tracking-tight text-white">FleetMind Platform</span>}
          </div>
          {!collapsed && (
            <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar" className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {collapsed && (
            <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar" className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <nav className={`flex-1 space-y-1 overflow-y-auto py-5 ${collapsed ? "px-2" : "px-3"}`} aria-label="FleetMind pages">
          {!collapsed && <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Workspace</p>}
          {links.map(({ href, label, icon: Icon, key }) => (
            <Link
              key={key}
              href={href}
              aria-current={current === key ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={`flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition ${collapsed ? "justify-center px-0" : "px-3"} ${current === key ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          ))}
        </nav>

        <div className={`shrink-0 border-t border-zinc-800 py-3 ${collapsed ? "px-2" : "px-3"}`}>
          <div className={`flex h-10 items-center rounded-xl text-xs text-zinc-400 ${collapsed ? "justify-center" : "gap-3 px-3"}`} title={collapsed ? `Live stream: ${streamState}` : undefined}>
            <Wifi className={`h-4 w-4 shrink-0 ${streamState === "connected" ? "text-emerald-400" : "text-amber-300"}`} aria-hidden="true" />
            {!collapsed && <><span>Live stream</span><span className={`ml-auto rounded-full px-2 py-1 text-[10px] ${streamState === "connected" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>{streamState}</span></>}
          </div>
          <button type="button" onClick={onSignOut} title={collapsed ? "Sign out" : undefined} className={`mt-1 flex h-10 w-full items-center rounded-xl text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 ${collapsed ? "justify-center" : "gap-3 px-3"}`}>
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
