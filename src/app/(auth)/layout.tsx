/**
 * Sprint 19.9.1 — auth route-group layout.
 *
 * Adds a top-right LocaleSwitcher so visitors can change the language
 * before they sign in / sign up. Without this the switcher only
 * appears inside the dashboard sidebar — useless for first-time
 * visitors who land on the auth flow.
 *
 * The layout doesn't render its own background or shell — the existing
 * sign-in / sign-up pages already provide that. We just float the
 * switcher in the top-right corner so it doesn't fight for layout
 * with whatever the page renders.
 */
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      <div
        className="absolute right-4 top-4 z-50"
        data-testid="auth-locale-switcher"
      >
        <LocaleSwitcher />
      </div>
      {children}
    </div>
  );
}
