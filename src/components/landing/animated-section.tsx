"use client";

/**
 * Scroll-triggered section wrapper. Children fade up once when the
 * section enters the viewport. Mirrors the legacy landing's animation
 * pattern so every section on the page reads as "alive" on scroll.
 *
 * Uses the IntersectionObserver API directly — no framer-motion
 * dependency on this hot path, no JS bundle bloat. Respects
 * `prefers-reduced-motion` (renders content immediately).
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** ms — delay before animation kicks in. Useful when stacking sections. */
  delay?: number;
  /** rootMargin passed to IntersectionObserver (default "-80px") */
  rootMargin?: string;
  /** ARIA label */
  "aria-label"?: string;
}

export function AnimatedSection({
  children,
  className,
  id,
  delay = 0,
  rootMargin = "-80px",
  "aria-label": ariaLabel,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setVisible(true);
      return;
    }

    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <section
      ref={ref}
      id={id}
      aria-label={ariaLabel}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out will-change-[opacity,transform]",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12",
        className,
      )}
    >
      {children}
    </section>
  );
}
