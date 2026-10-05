import React from "react";
import { FleetNode } from "@/types/fleet";

interface NodeSelectorProps {
  nodes: FleetNode[];
  selectedNodeId: string;
  onChange: (nodeId: string) => void;
}

export function NodeSelector({ nodes, selectedNodeId, onChange }: NodeSelectorProps) {
  return (
    <div className="flex items-center space-x-3">
      <span className="text-xs text-zinc-400 font-medium">Active Node:</span>
      <select
        value={selectedNodeId}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-zinc-700 transition"
      >
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name}
          </option>
        ))}
      </select>
    </div>
  );
}
