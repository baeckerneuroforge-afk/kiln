"use client";

/**
 * Subtle dotted-grid background for the light landing surface. Replaces
 * the dark-mode StarField — drifting stars on a warm cream background
 * read as smudges, while a fixed dot grid feels like architectural
 * graph paper and stays calm.
 *
 * Pure CSS — no canvas, no rAF. Two stacked radial-gradient layers (a
 * tighter dot field + a larger orange aurora) keep the section
 * visually anchored without competing with foreground content.
 *
 * Respects `prefers-reduced-motion`: the parallax shift on scroll is
 * skipped automatically so the page reads identically with motion off.
 */
import { useEffect, useRef } from "react";

export function DotGrid() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf: number | undefined;
    const onScroll = () => {
      if (raf !== undefined) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY * 0.05;
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        raf = undefined;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="landing-dot-grid"
      className="pointer-events-none fixed inset-0 z-0 will-change-transform"
      style={{
        backgroundImage: [
          "radial-gradient(circle at 70% 30%, rgba(254, 215, 170, 0.35), transparent 55%)",
          "radial-gradient(circle at 15% 80%, rgba(249, 115, 22, 0.05), transparent 60%)",
          "radial-gradient(rgba(0, 0, 0, 0.06) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "100% 100%, 100% 100%, 28px 28px",
        backgroundPosition: "0 0, 0 0, 0 0",
      }}
    />
  );
}
