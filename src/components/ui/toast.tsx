"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type ToastAction = {
  children: string;
  onClick: () => void;
};

type ToastOptions = {
  title: string;
  description?: string;
  actionProps?: ToastAction;
};

type ToastItem = ToastOptions & { id: string };
type ToastEventDetail = ToastItem;

export const toast = {
  add(options: ToastOptions) {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<ToastEventDetail>("fleetmind:toast:add", { detail: { ...options, id } }));
    }
    return id;
  },
  close(id: string) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("fleetmind:toast:close", { detail: { id } }));
  },
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const addToast = (event: Event) => {
      const item = (event as CustomEvent<ToastEventDetail>).detail;
      setItems((current) => [...current.filter((toastItem) => toastItem.id !== item.id), item]);
      window.setTimeout(() => toast.close(item.id), 5200);
    };
    const closeToast = (event: Event) => {
      const { id } = (event as CustomEvent<{ id: string }>).detail;
      setItems((current) => current.filter((item) => item.id !== id));
    };
    window.addEventListener("fleetmind:toast:add", addToast);
    window.addEventListener("fleetmind:toast:close", closeToast);
    return () => {
      window.removeEventListener("fleetmind:toast:add", addToast);
      window.removeEventListener("fleetmind:toast:close", closeToast);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto rounded-2xl border border-emerald-400/25 bg-[#11171a]/95 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><Check className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
              {item.description && <p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.description}</p>}
              {item.actionProps && <button type="button" onClick={item.actionProps.onClick} className="mt-2 text-xs font-semibold text-blue-200 hover:text-white">{item.actionProps.children}</button>}
            </div>
            <button type="button" onClick={() => toast.close(item.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
