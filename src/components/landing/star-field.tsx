"use client";

/**
 * Animated star-field canvas background. Drifts slowly with subtle
 * twinkle. Pulled out of the legacy landing so the new sections can
 * share the same atmospheric background. GPU-cheap (one canvas,
 * one rAF loop, ~density-bounded star count).
 *
 * Respects `prefers-reduced-motion` — the field renders static when
 * the user has reduced motion enabled.
 */
import { useEffect, useRef } from "react";

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animId: number | undefined;
    let stars: {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      opacity: number;
      twinkleSpeed: number;
    }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const createStars = () => {
      stars = [];
      const count = Math.floor((canvas.width * canvas.height) / 4000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.5 + 0.3,
          vx: reduced ? 0 : (Math.random() - 0.5) * 0.15,
          vy: reduced ? 0 : (Math.random() - 0.5) * 0.1,
          opacity: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
        });
      }
    };
    createStars();

    let time = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 1;
      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < 0) star.x = canvas.width;
        if (star.x > canvas.width) star.x = 0;
        if (star.y < 0) star.y = canvas.height;
        if (star.y > canvas.height) star.y = 0;

        const twinkle = reduced
          ? 1
          : Math.sin(time * star.twinkleSpeed) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.fill();
      }
      if (!reduced) animId = requestAnimationFrame(draw);
    };
    if (reduced) {
      draw();
    } else {
      animId = requestAnimationFrame(draw);
    }

    const onResize = () => {
      resize();
      createStars();
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (animId !== undefined) cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: "transparent" }}
    />
  );
}
