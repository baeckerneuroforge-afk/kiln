/**
 * Sprint 19.10 — marketing route-group layout.
 *
 * Wraps /pricing and /faq with a shared header (sticky, dark-themed)
 * and footer. The existing landing-light landing page at `/` keeps
 * its own LandingNav + LandingFooter composition for now — converting
 * it would require collapsing the carefully-tuned light theme that
 * was put there intentionally (marketing-bright → dashboard-dark
 * transition).
 *
 * Header includes the LocaleSwitcher (Sprint 19.9.1) so visitors can
 * change DE/EN before signing up. Two CTAs in the top-right:
 *   - Login → /sign-in (Sprint 19.8.1 branded sign-in)
 *   - Start free → /sign-up
 */
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="pt-16">{children}</main>
      <MarketingFooter />
    </div>
  );
}
