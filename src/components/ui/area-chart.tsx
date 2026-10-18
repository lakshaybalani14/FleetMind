"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface AreaChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, string | number>[];
  index: string;
  indexType?: "number" | "category";
  category: string;
  strokeColor?: string;
  fillColor?: string;
  gridColor?: string;
  tooltipBgColor?: string;
  tooltipBorderColor?: string;
  valueFormatter?: (value: number) => string;
  indexFormatter?: (value: number | string) => string;
  referenceLine?: { value: number; label?: string; color?: string };
  animate?: boolean;
}

export const AreaChart = React.forwardRef<HTMLDivElement, AreaChartProps>(function AreaChart({
  data,
  index,
  indexType = "category",
  category,
  strokeColor = "#c7d7ff",
  fillColor = "#8f9fed",
  gridColor = "#303039",
  tooltipBgColor = "#18181b",
  tooltipBorderColor = "#3f3f46",
  valueFormatter = (value) => String(value),
  indexFormatter = (value) => String(value),
  referenceLine,
  animate = false,
  className,
  ...props
}, ref) {
  const chartId = React.useId().replace(/:/g, "");
  const gradientId = `telemetry-gradient-${chartId}`;

  return (
    <div ref={ref} className={cn("h-80 w-full", className)} {...props}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fillColor} stopOpacity={0.48} />
              <stop offset="95%" stopColor={fillColor} stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey={index} type={indexType} scale={indexType === "number" ? "time" : undefined} domain={indexType === "number" ? ["dataMin", "dataMax"] : undefined} axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={indexFormatter} minTickGap={24} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={valueFormatter} width={52} />
          <Tooltip
            contentStyle={{ backgroundColor: tooltipBgColor, borderColor: tooltipBorderColor, borderRadius: 12, color: "#f4f4f5", fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
            labelFormatter={(value) => indexFormatter(Number(value))}
            formatter={(value) => [valueFormatter(Number(value)), category]}
          />
          {referenceLine && <ReferenceLine y={referenceLine.value} stroke={referenceLine.color ?? "#fb7185"} strokeDasharray="4 4" label={referenceLine.label ? { value: referenceLine.label, fill: referenceLine.color ?? "#fb7185", fontSize: 9, position: "insideTopRight" } : undefined} />}
          <Area type="linear" dataKey={category} stroke={strokeColor} fill={`url(#${gradientId})`} strokeWidth={2.5} activeDot={{ r: 4, fill: strokeColor, stroke: "#09090b", strokeWidth: 2 }} isAnimationActive={animate} animationDuration={1300} animationEasing="ease-out" connectNulls />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
});

AreaChart.displayName = "AreaChart";
