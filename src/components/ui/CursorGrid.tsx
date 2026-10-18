"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface CursorGridProps {
  active: boolean;
  origin: { x: number; y: number };
  cellSize?: number;
  color?: string;
  radius?: number;
  holdTime?: number;
  fadeDuration?: number;
  fillOpacity?: number;
  gridOpacity?: number;
  spotlight?: number;
  clickPulse?: boolean;
}

export default function CursorGrid({
  active,
  origin,
  cellSize = 60,
  color = "#ffffff",
  radius = 140,
  holdTime = 400,
  fadeDuration = 800,
  fillOpacity = 0.06,
  gridOpacity = 0.08,
  spotlight = 0.6,
  clickPulse = true,
}: CursorGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!active || !canvas || !context) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let ratio = Math.min(window.devicePixelRatio || 1, 2);
    const started = performance.now();
    let frame = 0;
    const rgb = color.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16)) ?? [255, 255, 255];
    const rgba = (alpha: number) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      const elapsed = now - started;
      const phaseElapsed = Math.max(0, elapsed - 650);
      const fade = phaseElapsed <= holdTime ? 1 : Math.max(0, 1 - (phaseElapsed - holdTime) / fadeDuration);
      const pulseProgress = Math.max(0, Math.min(1, (phaseElapsed - holdTime) / fadeDuration));
      context.clearRect(0, 0, width, height);
      const coverDuration = 650;
      const coverProgress = Math.min(1, elapsed / coverDuration);
      const coverRadius = Math.max(1, coverProgress * Math.hypot(width, height));
      context.save();
      context.beginPath();
      context.arc(origin.x, origin.y, coverRadius, 0, Math.PI * 2);
      context.clip();
      context.fillStyle = "rgba(5, 6, 11, 0.98)";
      context.fillRect(0, 0, width, height);

      context.lineWidth = 1;
      context.strokeStyle = rgba(gridOpacity * fade);
      context.beginPath();
      for (let x = 0; x <= width; x += cellSize) { context.moveTo(x, 0); context.lineTo(x, height); }
      for (let y = 0; y <= height; y += cellSize) { context.moveTo(0, y); context.lineTo(width, y); }
      context.stroke();

      for (let y = Math.max(0, Math.floor((origin.y - radius) / cellSize) * cellSize); y < origin.y + radius && y < height; y += cellSize) {
        for (let x = Math.max(0, Math.floor((origin.x - radius) / cellSize) * cellSize); x < origin.x + radius && x < width; x += cellSize) {
          const distance = Math.hypot(x + cellSize / 2 - origin.x, y + cellSize / 2 - origin.y);
          if (distance > radius) continue;
          const strength = 1 - distance / radius;
          context.fillStyle = rgba(fillOpacity * spotlight * strength * fade);
          context.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }
      }
      context.restore();

      if (clickPulse && phaseElapsed >= holdTime && pulseProgress < 1) {
        const maxRadius = Math.hypot(width, height);
        const pulseRadius = pulseProgress * maxRadius;
        context.beginPath();
        context.arc(origin.x, origin.y, pulseRadius, 0, Math.PI * 2);
        context.strokeStyle = rgba(0.42 * (1 - pulseProgress));
        context.lineWidth = Math.max(1, 2 * (1 - pulseProgress));
        context.stroke();
        const glow = context.createRadialGradient(origin.x, origin.y, Math.max(0, pulseRadius - 100), origin.x, origin.y, pulseRadius + 4);
        glow.addColorStop(0, rgba(0));
        glow.addColorStop(0.98, rgba(0));
        glow.addColorStop(1, rgba(0.12 * (1 - pulseProgress)));
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
      }
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [active, origin.x, origin.y, cellSize, color, radius, holdTime, fadeDuration, fillOpacity, gridOpacity, spotlight, clickPulse]);

  if (!active) return null;
  return createPortal((
    <div className="cursor-grid-transition" role="status" aria-live="polite" aria-label="Connecting securely">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <span className="cursor-grid-message">Connecting securely…</span>
    </div>
  ), document.body);
}
