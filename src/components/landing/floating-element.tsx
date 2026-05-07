"use client";

/**
 * Mouse-parallax wrapper extracted from the legacy landing.
 *
 * The wrapped element drifts a few pixels in the direction of the
 * cursor relative to the viewport center. Cheap (single mousemove
 * listener, throttled by requestAnimationFrame). Disabled when the
 * user prefers reduced motion or pointer-coarse (touch).
 */
import { useEffect, useRef, useState } from "react";

interface FloatingElementProps {
  children: React.ReactNode;
  /** px — maximum drift distance at the screen edge. */
  intensity?: number;
  className?: string;
}

export function FloatingElement({
  children,
  intensity = 18,
  className,
}: FloatingElementProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;

    const onMove = (e: MouseEvent) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = (e.clientX - cx) / cx;
        const dy = (e.clientY - cy) / cy;
        setOffset({ x: dx * intensity, y: dy * intensity });
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [intensity]);

  return (
    <div
      className={className}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: "transform 0.3s ease-out",
      }}
    >
      {children}
    </div>
  );
}
