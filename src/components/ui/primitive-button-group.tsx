import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function ButtonGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="group" className={cn("inline-flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-1", className)} {...props} />;
}
