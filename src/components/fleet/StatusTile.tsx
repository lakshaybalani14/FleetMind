import React from "react";
import { Cpu, Fan, AlertOctagon, CheckCircle2 } from "lucide-react";

interface StatusTileProps {
  title: string;
  value: string;
  subText: string;
  status: "success" | "warning" | "danger" | "neutral";
}

export function StatusTile({ title, value, subText, status }: StatusTileProps) {
  const borderColors = {
    success: "border-emerald-500/30 bg-emerald-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    danger: "border-red-500/30 bg-red-500/5",
    neutral: "border-zinc-800/80 bg-[#111113]",
  };

  const badgeIcons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    warning: <Fan className="w-4 h-4 text-amber-400 animate-spin" />,
    danger: <AlertOctagon className="w-4 h-4 text-red-400" />,
    neutral: <Cpu className="w-4 h-4 text-zinc-500" />,
  };

  return (
    <div className={cn("p-5 rounded-2xl border transition-all", borderColors[status])}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-zinc-400">{title}</span>
        {badgeIcons[status]}
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{subText}</p>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
