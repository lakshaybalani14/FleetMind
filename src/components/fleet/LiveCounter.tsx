"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Props {
  value: number;
  decimals?: number;
  className?: string;
}

/** Odometer-style counter for values that update with live telemetry. */
export function LiveCounter({ value, decimals = 0, className = "" }: Props) {
  const tracks = useRef<Array<HTMLSpanElement | null>>([]);
  const previousText = useRef<string | null>(null);
  const [introComplete, setIntroComplete] = useState(false);

  const text = introComplete
    ? Number.isFinite(value) ? value.toFixed(decimals) : "—"
    : (0).toFixed(decimals);
  const digits = useMemo(() => text.split(""), [text]);
  const digitPositions = useMemo(() => digits.reduce<number[]>((positions, character, index) => {
    if (/\d/.test(character)) positions.push(index);
    return positions;
  }, []), [digits]);

  useClientLayoutEffect(() => {
    const previous = previousText.current;
    if (previous === null) {
      previousText.current = text;
      setIntroComplete(true);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    digits.forEach((character, index) => {
      if (!/\d/.test(character)) return;
      const track = tracks.current[index];
      if (!track) return;

      const nextDigit = Number(character);
      const previousCharacter = previous[index];
      const previousDigit = /\d/.test(previousCharacter ?? "") ? Number(previousCharacter) : 0;
      const step = ((nextDigit - previousDigit + 5 + 10) % 10) - 5;
      const startPosition = previousDigit + 10;
      const endPosition = startPosition + step;
      const digitRank = digitPositions.indexOf(index);

      track.getAnimations().forEach((animation) => animation.cancel());
      track.style.transform = `translateY(-${nextDigit + 10}em)`;
      if (reduceMotion || startPosition === endPosition) return;

      const animation = track.animate(
        [
          { transform: `translateY(-${startPosition}em)`, opacity: 0.35, filter: "blur(1.5px)" },
          { transform: `translateY(-${endPosition}em)`, opacity: 1, filter: "blur(0)" },
        ],
        { duration: 700, delay: digitRank * 40, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
      );
      animation.onfinish = () => {
        animation.cancel();
        track.style.transform = `translateY(-${nextDigit + 10}em)`;
      };
    });

    previousText.current = text;
  }, [text, digits, digitPositions]);

  return (
    <span className={`live-counter ${className}`} aria-label={text}>
      {digits.map((character, index) => {
        if (!/\d/.test(character)) {
          return <span key={`separator-${index}`} className="live-counter-separator">{character}</span>;
        }

        const digit = Number(character);
        return (
          <span key={`digit-${index}`} className="live-counter-window" aria-hidden="true">
            <span
              ref={(element) => { tracks.current[index] = element; }}
              className="live-counter-track"
              style={{
                transform: `translateY(-${digit + 10}em)`,
              }}
            >
              {Array.from({ length: 30 }, (_, number) => <span key={number}>{number % 10}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
