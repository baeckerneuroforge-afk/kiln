/**
 * Sprint 19.10 — marketing footer for /pricing + /faq.
 *
 * Four-column on desktop, single-column stacked on mobile. Brand
 * tagline + product / resources / legal / company columns. Year is
 * computed at render time so we don't ship a stale copyright after
 * Jan 1.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function MarketingFooter() {
  const t = await getTranslations("marketing.footer");
  const year = new Date().getFullYear();

  const columns = [
    {
      heading: t("product"),
      links: [
        { label: "Features", href: "/#features" },
        { label: "Pricing", href: "/pricing" },
        { label: "FAQ", href: "/faq" },
        { label: "Changelog", href: "/changelog" },
      ],
    },
    {
      heading: t("resources"),
      links: [
        { label: "Docs", href: "/docs" },
        { label: "Help", href: "/help" },
        { label: "Marketplace", href: "/marketplace" },
        { label: "Developers", href: "/developers" },
      ],
    },
    {
      heading: t("legal"),
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "DPA", href: "/dpa" },
        { label: "Impressum", href: "/impressum" },
      ],
    },
    {
      heading: t("company"),
      links: [
        { label: "For Agencies", href: "/agencies" },
        { label: "Enterprise", href: "/enterprise" },
        { label: "Services", href: "/services" },
      ],
    },
  ];

  return (
    <footer
      className="border-t border-white/[0.08] bg-background"
      data-testid="marketing-footer"
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #F97316, #DC2626)",
                }}
                aria-hidden
              >
                K
              </div>
              <span className="font-serif text-xl tracking-tight text-foreground">
                KILN
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              {t("tagline")}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("byHephaistos")}
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                {col.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-white/[0.06] pt-6">
          <p className="text-xs text-muted-foreground">
            {t("copyright", { year })}
          </p>
        </div>
      </div>
    </footer>
  );
}
