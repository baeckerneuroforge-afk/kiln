"use client";

/**
 * 3D mouse-tilt wrapper extracted from the legacy landing.
 *
 * Card rotates a few degrees toward the cursor on hover. Cheap (CSS
 * variable updated via rAF-throttled mousemove). Disabled on touch
 * (pointer:coarse) and when the user prefers reduced motion. Children
 * stay clickable — pointer-events propagate through normally.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: React.ReactNode;
  /** Maximum tilt angle in degrees on the most extreme corner. */
  maxTilt?: number;
  /** CSS perspective in px. Bigger = subtler 3D. */
  perspective?: number;
  /** Hover scale (default 1.02 — subtle). */
  scale?: number;
  className?: string;
}

export function TiltCard({
  children,
  maxTilt = 6,
  perspective = 800,
  scale = 1.02,
  className,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [transform, setTransform] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setEnabled(!reduced && !coarse);
  }, []);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      // Cursor below center → tilt forward (negative X rotation)
      const rotateX = ((y - cy) / cy) * -maxTilt;
      const rotateY = ((x - cx) / cx) * maxTilt;
      setTransform(
        `perspective(${perspective}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`,
      );
    });
  };

  const handleLeave = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setTransform(null);
  };

  return (
    <div
      ref={ref}
      onMouseMove={enabled ? handleMove : undefined}
      onMouseLeave={enabled ? handleLeave : undefined}
      className={cn("transition-transform duration-200 ease-out will-change-transform", className)}
      style={transform ? { transform } : undefined}
    >
      {children}
    </div>
  );
}
