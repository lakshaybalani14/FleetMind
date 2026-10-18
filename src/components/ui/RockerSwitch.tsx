"use client";

import { cn } from "@/lib/utils";

interface RockerSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

export function RockerSwitch({ checked, onChange, disabled, label }: RockerSwitchProps) {
  return (
    <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("rocker-control relative grid h-9 w-[66px] grid-cols-2 items-center overflow-hidden border border-zinc-600/80 bg-zinc-900 p-[3px] font-sans text-[9px] font-extrabold tracking-tight text-zinc-400 shadow-[inset_0_1px_4px_rgba(0,0,0,.55)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50", checked && "is-on")}>
      <span className="rocker-yes relative z-10 grid h-[25px] place-items-center">YES</span>
      <span className="rocker-no relative z-10 grid h-[25px] place-items-center">NO</span>
      <span aria-hidden="true" className="rocker-thumb absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] shadow-[0_2px_5px_rgba(0,0,0,.35)]" />
    </button>
  );
}
