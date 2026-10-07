"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeCognitoLogin } from "@/lib/cognito";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeCognitoLogin(new URL(window.location.href))
      .then(() => router.replace("/"))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Sign-in failed."));
  }, [router]);
  return <main className="min-h-screen bg-[#09090b] p-8 text-zinc-200">{error || "Finishing secure sign-in…"}</main>;
}
