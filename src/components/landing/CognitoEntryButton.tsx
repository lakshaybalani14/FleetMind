"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import { beginCognitoLogin, getCognitoIdToken } from "@/lib/cognito";
import { ShinyButton } from "@/components/ui/ShinyButton";
import CursorGrid from "@/components/ui/CursorGrid";

export default function CognitoEntryButton({ variant = "header" }: { variant?: "header" | "primary" }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setSignedIn(Boolean(getCognitoIdToken()));
  }, []);

  const enterPlatform = async (event: MouseEvent<HTMLButtonElement>) => {
    setError("");
    setPending(true);
    // Recheck on click in case the session expired while the introduction was open.
    if (getCognitoIdToken()) {
      router.push("/monitoring");
      return;
    }
    setSignedIn(false);
    const bounds = event.currentTarget.getBoundingClientRect();
    setTransitionOrigin({
      x: event.clientX || bounds.left + bounds.width / 2,
      y: event.clientY || bounds.top + bounds.height / 2,
    });
    setTransitioning(true);
    try {
      // Let the grid expand across the viewport, hold, and finish its pulse
      // before navigating away to Cognito's hosted sign-in page.
      await new Promise((resolve) => window.setTimeout(resolve, 1900));
      await beginCognitoLogin();
    } catch (reason: unknown) {
      setTransitioning(false);
      setError(reason instanceof Error ? reason.message : "Secure sign-in could not start. Please try again.");
      setPending(false);
    }
  };

  const primary = variant === "primary";
  const label = pending ? "Opening…" : primary ? "Sign in securely" : signedIn ? "Open dashboard" : "Sign in securely";

  return (
    <div className="relative max-w-full">
      {primary ? (
        <ShinyButton onClick={(event) => void enterPlatform(event)} disabled={pending} ariaBusy={pending} className="group gap-6 px-6 py-3.5 text-sm font-semibold">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {label}
          {signedIn && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
        </ShinyButton>
      ) : (
        <button type="button" onClick={(event) => void enterPlatform(event)} disabled={pending} aria-busy={pending} className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-medium transition hover:border-blue-300/40 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300 disabled:cursor-wait disabled:opacity-60 sm:px-5 sm:text-[13px]">
          {(!signedIn || primary) && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {label}
          {signedIn && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      )}
      {error && <p role="alert" className="mt-3 max-w-xs text-xs leading-5 text-red-300">{error}</p>}
      <CursorGrid active={transitioning} origin={transitionOrigin} cellSize={60} color="#ffffff" radius={140} holdTime={400} fadeDuration={800} fillOpacity={0.06} gridOpacity={0.08} spotlight={0.6} clickPulse />
    </div>
  );
}
