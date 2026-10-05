import { useState, useEffect, useCallback } from "react";
import { TelemetryPoint, FleetNode, ActionLogEntry } from "@/types/fleet";
import { INITIAL_NODES, generateInitialTelemetry, INITIAL_LOGS } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";

export function useFleetData() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node-01");
  const [nodes, setNodes] = useState<FleetNode[]>(INITIAL_NODES);
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, TelemetryPoint[]>>({
    "node-01": generateInitialTelemetry("node-01"),
    "node-02": generateInitialTelemetry("node-02"),
  });
  const [logs, setLogs] = useState<ActionLogEntry[]>(INITIAL_LOGS);

  const addLog = useCallback((log: Omit<ActionLogEntry, "id">) => {
    setLogs((prev) => [{ ...log, id: generateId("log") }, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const isAnomalyTrigger = Math.random() > 0.88;

      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          const isTargetNode = node.id === selectedNodeId;
          const gasSpike = isTargetNode && isAnomalyTrigger ? 450 + Math.random() * 200 : 0;
          const newGas = Math.round(280 + Math.random() * 40 + gasSpike);
          const isAnomaly = newGas > 500;

          if (isAnomaly && isTargetNode) {
            addLog({
              timestamp: now,
              nodeId: node.id,
              eventType: "anomaly_detected",
              message: `Isolation Forest flagged gas spike: ${newGas} PPM`,
              source: "AWS Lambda ML",
              severity: "critical",
            });
            addLog({
              timestamp: now,
              nodeId: node.id,
              eventType: "actuator_command",
              message: "AWS IoT Shadow updated: Relay ON (Exhaust Fan Actuated)",
              source: "AWS IoT Core",
              severity: "warning",
            });
          }

          return {
            ...node,
            gasLevel: newGas,
            temperature: +(node.temperature + (Math.random() - 0.5) * 0.4).toFixed(1),
            humidity: +(node.humidity + (Math.random() - 0.5) * 0.6).toFixed(1),
            actuatorState: {
              relayActive: isAnomaly,
              fanActive: isAnomaly,
              buzzerActive: isAnomaly,
            },
            lastSeen: "Just now",
          };
        })
      );

      setTelemetryHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((id) => {
          const currentNode = nodes.find((n) => n.id === id);
          const gas = currentNode ? currentNode.gasLevel : 300;
          const newPoint: TelemetryPoint = {
            timestamp: now,
            temperature: currentNode ? currentNode.temperature : 24,
            humidity: currentNode ? currentNode.humidity : 50,
            gasLevel: gas,
            isAnomaly: gas > 500,
          };
          updated[id] = [...updated[id].slice(1), newPoint];
        });
        return updated;
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [selectedNodeId, addLog, nodes]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    nodes,
    selectedNode: nodes.find((n) => n.id === selectedNodeId) || nodes[0],
    activeTelemetry: telemetryHistory[selectedNodeId] || [],
    logs,
  };
}
