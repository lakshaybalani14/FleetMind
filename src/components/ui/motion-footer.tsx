import Link from "next/link";
import { ArrowUpRight, Cpu, Github } from "lucide-react";

/** A sticky footer revealed from behind the landing page as it scrolls away. */
export function CinematicFooter() {
  return (
    <footer className="cinematic-footer sticky bottom-0 z-0 flex min-h-[280px] items-end overflow-hidden border-t border-white/10 px-5 pb-7 pt-12 text-zinc-100 sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 bottom-[-180px] h-[340px] rounded-[50%] bg-violet-600/20 blur-[90px]" />
        <div className="absolute inset-x-[8%] bottom-[-230px] h-[360px] rounded-[50%] border border-violet-300/20 shadow-[0_-15px_60px_rgba(127,93,255,0.2)]" />
        <div className="absolute inset-x-[18%] bottom-[-255px] h-[380px] rounded-[50%] border border-blue-300/10" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/50 to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1320px] flex-wrap items-end justify-between gap-6">
        <div>
          <Link href="/" aria-label="FleetMind home" className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-200"><Cpu className="h-4 w-4" aria-hidden="true" /></span>
            FleetMind<span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
          </Link>
          <p className="mt-3 text-xs text-zinc-400">Connected devices. Clearer decisions.</p>
        </div>
        <div className="flex items-center gap-5 text-xs text-zinc-400">
          <Link className="inline-flex items-center gap-2 transition hover:text-white" href="/monitoring">Explore the platform <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          <a href="https://github.com/lakshaybalani14/FleetMind" target="_blank" rel="noopener noreferrer" aria-label="FleetMind on GitHub" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"><Github className="h-4 w-4" aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}
