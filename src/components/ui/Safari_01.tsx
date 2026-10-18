"use client";

import Image, { type StaticImageData } from "next/image";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Safari_01Props {
  image?: StaticImageData | string;
  className?: string;
  alt?: string;
  address?: string;
  priority?: boolean;
}

export default function Safari_01({
  image,
  className,
  alt = "FleetMind dashboard preview",
  address = "FleetMind",
  priority = false,
}: Safari_01Props) {
  return (
    <div className={cn("w-full min-w-0 overflow-hidden rounded-xl border border-zinc-700/70 bg-[#0c0c0e] shadow-2xl shadow-black/40", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#1b1b20] px-3 py-2.5 sm:px-4">
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400 sm:h-3 sm:w-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 sm:h-3 sm:w-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 sm:h-3 sm:w-3" />
        </div>
        <div className="mx-auto flex h-6 min-w-0 max-w-xs flex-1 items-center justify-center gap-1.5 rounded-md border border-white/5 bg-black/20 px-2 text-[9px] text-zinc-400 sm:text-[10px]">
          <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{address}</span>
        </div>
        <div className="w-5 shrink-0 sm:w-12" aria-hidden="true" />
      </div>
      <div className="relative flex aspect-video items-center justify-center bg-[#09090b]">
        {image ? (
          <Image
            src={image}
            alt={alt}
            width={1440}
            height={810}
            sizes="(min-width: 1280px) 600px, (min-width: 768px) 48vw, 100vw"
            priority={priority}
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="text-sm text-zinc-500">No preview image</p>
        )}
      </div>
    </div>
  );
}
