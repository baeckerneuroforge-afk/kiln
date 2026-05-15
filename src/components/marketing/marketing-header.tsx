"use client";

/**
 * Sprint 19.10 — sticky marketing header for /pricing + /faq.
 *
 * Three-section layout: brand left, nav center (desktop only), CTAs +
 * LocaleSwitcher right. Hamburger menu under md-breakpoint. Sticky
 * with backdrop-blur once the user scrolls past the first 12px so the
 * page-content scrolls under it cleanly.
 *
 * The existing root-landing page uses its own LandingNav (light-themed)
 * — see (marketing)/layout.tsx for the rationale on why this header
 * is separate.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function MarketingHeader() {
  const t = useTranslations("marketing.nav");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems = [
    { label: t("features"), href: "/#features" },
    { label: t("pricing"), href: "/pricing" },
    { label: t("faq"), href: "/faq" },
    { label: t("forAgencies"), href: "/agencies" },
  ];

  return (
    <nav
      data-testid="marketing-header"
      className={cn(
        "fixed top-0 z-50 w-full transition-colors duration-200",
        scrolled
          ? "border-b border-white/[0.08] bg-background/80 backdrop-blur-xl"
          : "bg-transparent",
      )}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="KILN home"
          data-testid="marketing-header-logo"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white shadow-md transition-transform group-hover:scale-105"
            style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            aria-hidden
          >
            K
          </div>
          <span className="font-serif text-xl tracking-tight text-foreground">
            KILN
          </span>
        </Link>

        <div
          className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex"
          data-testid="marketing-header-nav"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LocaleSwitcher className="hidden sm:block" />
          <Link
            href="/sign-in"
            className="hidden text-[13px] font-medium text-muted-foreground transition-colors hover:text-kiln-orange sm:inline"
            data-testid="marketing-header-login"
          >
            {t("login")}
          </Link>
          <Link
            href="/sign-up"
            data-testid="marketing-header-cta"
            className="hidden items-center gap-1.5 rounded-lg bg-kiln-orange px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-kiln-orange/30 transition-all hover:bg-kiln-orange/95 hover:shadow-lg sm:inline-flex"
          >
            {t("startFree")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            data-testid="marketing-header-mobile-toggle"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="border-t border-white/[0.08] bg-background/95 backdrop-blur-xl md:hidden"
          data-testid="marketing-header-mobile-menu"
        >
          <div className="mx-auto max-w-6xl space-y-1 px-6 py-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-white/[0.08] pt-3">
              <Link
                href="/sign-in"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t("login")}
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-kiln-orange px-3 py-2 text-sm font-semibold text-white shadow-md shadow-kiln-orange/30"
              >
                {t("startFree")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="border-t border-white/[0.08] pt-3">
              <LocaleSwitcher variant="inline" />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
