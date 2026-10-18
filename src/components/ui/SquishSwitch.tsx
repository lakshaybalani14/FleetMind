"use client";

import { cn } from "@/lib/utils";

interface SquishSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  trackColor?: string;
  trackOnColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  speed?: number;
  stretch?: number;
  hoverScale?: number;
  colorDuration?: number;
  disabled?: boolean;
  thumbColor?: string;
  thumbOnColor?: string;
  className?: string;
}

export default function SquishSwitch({
  checked, onChange, label, trackColor = "#27272a", trackOnColor = "#f5f5f5",
  width = 76, height = 38, radius = 19, speed = 50, stretch = 36,
  hoverScale = 1.035, colorDuration = 320, disabled = false,
  thumbColor = "#4e4e51", thumbOnColor = "#27272a", className,
}: SquishSwitchProps) {
  const thumbSize = height - 8;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("group relative inline-flex shrink-0 items-center border border-white/10 p-1 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50", className)}
      style={{ width, height, borderRadius: radius, backgroundColor: checked ? trackOnColor : trackColor, transitionDuration: `${colorDuration}ms`, transformOrigin: "center" }}
      onMouseEnter={(event) => { if (!disabled) event.currentTarget.style.transform = `scale(${hoverScale})`; }}
      onMouseLeave={(event) => { event.currentTarget.style.transform = "scale(1)"; }}
      onPointerDown={(event) => { if (!disabled) event.currentTarget.style.transform = `scale(${hoverScale}, ${1 - speed / 1000})`; }}
      onPointerUp={(event) => { event.currentTarget.style.transform = `scale(${hoverScale})`; }}
    >
      <span
        aria-hidden="true"
        className="block rounded-full shadow-[0_1px_5px_rgba(0,0,0,.35)]"
        style={{
          width: thumbSize,
          height: thumbSize,
          backgroundColor: checked ? thumbOnColor : thumbColor,
          transform: `translateX(${checked ? width - thumbSize - 8 : 0}px) scaleX(${stretch > 0 ? 1 + Math.min(stretch, 50) / 200 : 1})`,
          transition: `transform ${colorDuration}ms cubic-bezier(.2,.9,.2,1), background-color ${colorDuration}ms ease`,
        }}
      />
    </button>
  );
}
