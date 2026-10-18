import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost";
  size?: "sm" | "default";
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return <button className={cn("inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:pointer-events-none disabled:opacity-50", size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm", variant === "ghost" ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" : "bg-zinc-800 text-white hover:bg-zinc-700", className)} {...props} />;
}
