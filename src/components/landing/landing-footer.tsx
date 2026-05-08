"use client";

/**
 * Footer for the landing page. Stays DARK on purpose — sits below the
 * dark Final-CTA section so the page closes with a single dark band
 * (no double-stripe) and the dark auth pages + dashboard inherit
 * visual continuity.
 *
 * Built-in-Germany line is prominent; link rail is grouped into
 * Product / Resources / Legal so the footer stays scannable rather
 * than dumping every link in one row.
 */
import Link from "next/link";

const PRODUCT = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Services", href: "/services" },
  { label: "For Agencies", href: "/agencies" },
];

const RESOURCES = [
  { label: "Docs", href: "/docs" },
  { label: "Developers", href: "/developers" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Computer Use", href: "/computer-use" },
];

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "DPA", href: "/dpa" },
  { label: "Impressum", href: "/impressum" },
];

const SOCIAL: { label: string; href: string }[] = [
  { label: "X", href: "https://x.com/baeckerneuro" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/andrebaecker" },
  { label: "GitHub", href: "https://github.com/baeckerneuroforge-afk" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-stone-800 bg-stone-950">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #F97316, #DC2626)",
                }}
                aria-hidden
              >
                K
              </div>
              <span className="font-serif text-xl tracking-tight text-white">
                KILN
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-stone-400">
              The agency-first AI platform.
              <br />
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>🇪🇺</span>
                Built in Germany by Hephaistos Systems.
              </span>
            </p>
          </div>

          <FooterColumn title="Product" items={PRODUCT} />
          <FooterColumn title="Resources" items={RESOURCES} />
          <FooterColumn title="Legal" items={LEGAL} />
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-stone-800 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-stone-500">
            © {new Date().getFullYear()} Hephaistos Systems · KILN
          </p>
          <div className="flex items-center gap-4 text-xs text-stone-400">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-white"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="text-stone-400 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
