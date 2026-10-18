"use client";

import { useEffect, useRef } from "react";

interface ParticleTextProps {
  text: string;
  particleSize?: number;
  density?: number;
  color?: string;
  highlightColor?: string;
  highlightMode?: "motion";
  shape?: "circle";
  intro?: "gather";
  scatter?: number;
  gatherDuration?: number;
  stagger?: number;
  clickBurst?: boolean;
  burstStrength?: number;
  pointerRepel?: number;
  repelRadius?: number;
  idleDrift?: number;
  trigger?: "mount";
  fontSize?: string;
  fontWeight?: number;
  fontFamily?: string;
  glow?: boolean;
}

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  fromX: number;
  fromY: number;
  phase: number;
  radius: number;
  vx: number;
  vy: number;
}

export default function ParticleText({
  text,
  particleSize = 2.2,
  density = 4,
  color = "currentColor",
  highlightColor = "#ff5a36",
  highlightMode = "motion",
  intro = "gather",
  scatter = 190,
  gatherDuration = 1600,
  stagger = 420,
  clickBurst = true,
  burstStrength = 1,
  pointerRepel = 42,
  repelRadius = 120,
  idleDrift = 0.8,
  trigger = "mount",
  fontSize = "clamp(3.5rem, 13vw, 9rem)",
  fontWeight = 800,
  fontFamily = "inherit",
  glow = true,
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particleColor = color === "currentColor" ? getComputedStyle(canvas).color : color;
    const pointer = { x: -1000, y: -1000 };
    let particles: Particle[] = [];
    let frame = 0;
    let start = performance.now();
    let burstAt = -Infinity;
    let burstX = 0;
    let burstY = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resolvedFontFamily = fontFamily === "inherit" ? getComputedStyle(canvas).fontFamily : fontFamily;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(200, box.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const sample = document.createElement("canvas");
      sample.width = Math.round(width);
      sample.height = Math.round(height);
      const sampleContext = sample.getContext("2d", { willReadFrequently: true });
      if (!sampleContext) return;
      const clampParts = fontSize.match(/clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)rem/i);
      let font = clampParts
        ? Math.max(Number(clampParts[1]) * 16, Math.min(Number(clampParts[3]) * 16, window.innerWidth * Number(clampParts[2]) / 100))
        : Math.min(144, width * 0.13);
      sampleContext.font = `${fontWeight} ${font}px ${resolvedFontFamily}`;
      while (sampleContext.measureText(text).width > width - 24 && font > 20) {
        font -= 2;
        sampleContext.font = `${fontWeight} ${font}px ${resolvedFontFamily}`;
      }
      sampleContext.textAlign = "center";
      sampleContext.textBaseline = "middle";
      sampleContext.fillText(text, width / 2, height / 2, width - 24);
      const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      const targets: Array<{ x: number; y: number }> = [];
      const step = Math.max(2, density);
      for (let y = 0; y < sample.height; y += step) {
        for (let x = 0; x < sample.width; x += step) {
          if (pixels[(y * sample.width + x) * 4 + 3] > 96) targets.push({ x, y });
        }
      }
      particles = targets.map(({ x, y }, index) => {
        const angle = Math.random() * Math.PI * 2;
        const distance = scatter * (0.35 + Math.random() * 0.9);
        return {
          x: reducedMotion ? x : x + Math.cos(angle) * distance,
          y: reducedMotion ? y : y + Math.sin(angle) * distance,
          targetX: x,
          targetY: y,
          fromX: reducedMotion ? x : x + Math.cos(angle) * distance,
          fromY: reducedMotion ? y : y + Math.sin(angle) * distance,
          phase: (index / Math.max(1, targets.length)) * stagger,
          radius: particleSize * (0.75 + Math.random() * 0.5),
          vx: 0,
          vy: 0,
        };
      });
      start = performance.now();
    };

    const locatePointer = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
    };
    const clearPointer = () => { pointer.x = -1000; pointer.y = -1000; };
    const burst = (event: MouseEvent) => {
      if (!clickBurst) return;
      const box = canvas.getBoundingClientRect();
      burstX = event.clientX - box.left;
      burstY = event.clientY - box.top;
      burstAt = performance.now();
      for (const particle of particles) {
        const dx = particle.x - burstX;
        const dy = particle.y - burstY;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance < 260) {
          particle.vx += (dx / distance) * (4 + Math.random() * 8) * burstStrength;
          particle.vy += (dy / distance) * (4 + Math.random() * 8) * burstStrength;
        }
      }
    };

    const draw = (now: number) => {
      context.clearRect(0, 0, width, height);
      const introProgress = reducedMotion || intro !== "gather" || trigger !== "mount"
        ? 1
        : Math.min(1, Math.max(0, (now - start - 120) / (gatherDuration + stagger)));
      const burstProgress = Math.min(1, Math.max(0, (now - burstAt) / 850));
      for (const particle of particles) {
        const gatherProgress = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - start - particle.phase) / gatherDuration));
        const eased = 1 - (1 - gatherProgress) ** 3;
        const targetX = particle.fromX + (particle.targetX - particle.fromX) * eased;
        const targetY = particle.fromY + (particle.targetY - particle.fromY) * eased;
        if (gatherProgress < 1) {
          particle.x += (targetX - particle.x) * 0.16;
          particle.y += (targetY - particle.y) * 0.16;
        } else {
          const dx = particle.targetX - pointer.x;
          const dy = particle.targetY - pointer.y;
          const distance = Math.hypot(dx, dy);
          const repel = distance > 0 && distance < repelRadius
            ? ((repelRadius - distance) / repelRadius) * Math.min(5, pointerRepel * 0.12)
            : 0;
          const repelX = repel ? (dx / distance) * repel : 0;
          const repelY = repel ? (dy / distance) * repel : 0;
          particle.vx += (particle.targetX + repelX - particle.x) * 0.018;
          particle.vy += (particle.targetY + repelY - particle.y) * 0.018;
          particle.vx *= 0.91;
          particle.vy *= 0.91;
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -8 || particle.x > width + 8 || particle.y < -8 || particle.y > height + 8) {
            particle.x = particle.x * (1 - burstProgress) + (width / 2) * burstProgress;
            particle.y = particle.y * (1 - burstProgress) + (height / 2) * burstProgress;
          }
          particle.x += Math.sin(now / 900 + particle.phase) * idleDrift * 0.12;
          particle.y += Math.cos(now / 1000 + particle.phase) * idleDrift * 0.12;
        }

        const highlightDistance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
        const highlight = !reducedMotion && highlightMode === "motion" && highlightDistance < 105;
        const alpha = introProgress < 1 ? Math.max(0.15, introProgress + Math.random() * 0.12) : 1;
        context.globalAlpha = alpha;
        context.fillStyle = highlight ? highlightColor : particleColor;
        if (glow && highlight) {
          context.shadowColor = highlightColor;
          context.shadowBlur = 12;
        }
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      }
      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("pointermove", locatePointer);
    canvas.addEventListener("pointerleave", clearPointer);
    canvas.addEventListener("click", burst);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", locatePointer);
      canvas.removeEventListener("pointerleave", clearPointer);
      canvas.removeEventListener("click", burst);
    };
  }, [text, particleSize, density, color, highlightColor, highlightMode, intro, scatter, gatherDuration, stagger, clickBurst, burstStrength, pointerRepel, repelRadius, idleDrift, trigger, fontSize, fontWeight, fontFamily, glow]);

  return <canvas ref={canvasRef} role="img" aria-label={text} className="h-full w-full touch-pan-y" />;
}
