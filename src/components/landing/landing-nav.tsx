"use client";

/**
 * Top navigation for the landing page. Sticky, fades a frosted-glass
 * backdrop blur on scroll. Drops Computer Use / Marketplace /
 * Developers from the top-level nav (still reachable via the footer +
 * direct links) so the bar reads as a tight five-item pitch.
 *
 * Light-theme: the frosted glass uses white/80 + heavy backdrop-blur,
 * matching the warm cream landing background. Above-fold (not yet
 * scrolled) the nav is fully transparent so the hero aurora flows
 * underneath.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Sprint 19.10 — Pricing + FAQ are now full pages (under /pricing
// and /faq via the (marketing) route group). Linking the inline
// #pricing anchor would dead-end at the teaser instead of the
// detailed plan comparison.
const NAV_ITEMS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "For Agencies", href: "/agencies" },
  { label: "Docs", href: "/docs" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 z-50 w-full transition-colors duration-200",
        scrolled
          ? "border-b border-stone-200/60 bg-white/80 backdrop-blur-xl"
          : "bg-transparent",
      )}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="KILN home"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white shadow-md shadow-kiln-orange/20 transition-transform group-hover:scale-105"
            style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            aria-hidden
          >
            K
          </div>
          <span className="font-serif text-xl tracking-tight text-stone-900">
            KILN
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] text-stone-600 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="transition-colors hover:text-stone-900"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="hidden text-[13px] font-medium text-stone-700 transition-colors hover:text-kiln-orange sm:inline"
          >
            Login
          </Link>
          <Link
            href="/sign-up"
            data-testid="nav-cta-primary"
            className="hidden items-center gap-1.5 rounded-lg bg-kiln-orange px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-kiln-orange/30 transition-all hover:bg-kiln-orange/95 hover:shadow-lg hover:shadow-kiln-orange/40 sm:inline-flex"
          >
            Start Free
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 md:hidden"
          >
            {mobileOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-stone-200 bg-white/95 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-6 py-3">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-stone-200 pt-3">
              <Link
                href="/sign-in"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                Login
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-kiln-orange px-3 py-2 text-sm font-semibold text-white shadow-md shadow-kiln-orange/30"
              >
                Start Free
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
