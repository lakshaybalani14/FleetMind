import React from "react";
import { ChevronDown } from "lucide-react";
import { FleetNode } from "@/types/fleet";

interface NodeSelectorProps {
  nodes: FleetNode[];
  selectedNodeId: string;
  onChange: (nodeId: string) => void;
  compact?: boolean;
}

export function NodeSelector({ nodes, selectedNodeId, onChange, compact = false }: NodeSelectorProps) {
  return (
    <div className="flex items-center space-x-3">
      <label htmlFor="active-node-select" className="text-xs font-medium text-zinc-500">{compact ? "Node" : "Active Node:"}</label>
      <div className="relative flex items-center">
        <select
          id="active-node-select"
          value={selectedNodeId}
          onChange={(e) => onChange(e.target.value)}
          style={{ colorScheme: "dark" }}
          className={compact
            ? "max-w-48 appearance-none truncate bg-transparent py-1 pl-0 pr-6 text-sm font-medium text-zinc-200 outline-none transition hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-blue-400/60"
            : "appearance-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 pr-8 text-xs text-zinc-200 outline-none transition focus:border-zinc-700"}
        >
          {nodes.map((node) => (
            <option key={node.id} value={node.id} className="bg-zinc-900 text-zinc-100">
              {node.name?.trim() || node.id}
            </option>
          ))}
        </select>
        <ChevronDown className={`pointer-events-none absolute h-3.5 w-3.5 text-zinc-500 ${compact ? "right-1" : "right-2"}`} aria-hidden="true" />
      </div>
    </div>
  );
}
