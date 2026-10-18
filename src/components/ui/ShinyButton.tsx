"use client";

import type React from "react";
import { cn } from "@/lib/utils";

interface ShinyButtonProps {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
  ariaBusy?: boolean;
}

export function ShinyButton({ children, onClick, className = "", disabled, ariaBusy }: ShinyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={ariaBusy}
      className={cn("shiny-cta", className)}
    >
      <span className="relative z-10 inline-flex items-center gap-3">{children}</span>
    </button>
  );
}
