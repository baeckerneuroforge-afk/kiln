import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  PENDING_TIER_COOKIE,
  PENDING_TIER_MAX_AGE_SECONDS,
  isPendingTier,
  type PendingTier,
} from "@/lib/billing/pending-tier";
import { getTierLimits } from "@/lib/billing/tier-limits";

/**
 * Sprint 20 — `?tier=free` query param opt-in (free-plan banner).
 *
 * Sprint 20.1.1 — Paid-tier persistence across sign-up.
 *
 * When the marketing pricing-page CTA forwards a logged-out visitor
 * with `?tier=free`, we render a green "Free Plan" banner above
 * Clerk's signup form so the visitor knows they're committing to
 * forever-free + can see the headline limits. No cookie needed —
 * free has nothing to checkout.
 *
 * When the param is one of the paid tier ids (`starter`,
 * `professional`, `agency_pro`), we render a similar orange banner
 * AND set a short-lived `kiln-pending-tier` cookie. The first
 * authenticated dashboard render reads that cookie, fires
 * /api/billing/upgrade, and redirects to Stripe Checkout — so a
 * visitor who clicks "Starter Start now" while logged out gets the
 * same end state as one who clicks it while logged in.
 *
 * `enterprise` and any other / missing value fall through with no
 * banner and no cookie (the enterprise card hits a mailto: link
 * directly, never reaches /sign-up).
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const params = await searchParams;
  const rawTier = typeof params.tier === "string" ? params.tier : null;
  const showFreeBanner = rawTier === "free";
  const pendingTier: PendingTier | null = isPendingTier(rawTier)
    ? (rawTier as PendingTier)
    : null;

  // Server-component cookie write — fires only when a paid tier hit
  // the page. cookies() in App Router is async on Next 15+.
  if (pendingTier) {
    const jar = await cookies();
    jar.set(PENDING_TIER_COOKIE, pendingTier, {
      maxAge: PENDING_TIER_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      // Intentionally NOT HttpOnly — see lib/billing/pending-tier.ts
      // for the rationale. UX state, not auth state.
    });
  }

  const freeT = await getTranslations("billing.freePlan");
  const paidT = await getTranslations("billing.pendingTier");
  const paidTierName = pendingTier ? getTierLimits(pendingTier).displayName : "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg font-serif text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
        >
          K
        </div>
        <span className="font-serif text-xl text-foreground">KILN</span>
      </Link>

      {showFreeBanner && (
        <div
          data-testid="sign-up-free-tier-banner"
          className="mb-6 w-full max-w-sm rounded-xl border border-kiln-green/30 bg-kiln-green/5 p-4 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-kiln-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-kiln-green">
              {freeT("label")}
            </span>
          </div>
          <h2 className="mt-2 font-serif text-base text-foreground">
            {freeT("signUpBannerTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {freeT("signUpBannerSubtitle")}
          </p>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>• {freeT("signUpBannerBullets.agents")}</li>
            <li>• {freeT("signUpBannerBullets.conversations")}</li>
            <li>• {freeT("signUpBannerBullets.subOrgs")}</li>
            <li>• {freeT("signUpBannerBullets.storage")}</li>
          </ul>
        </div>
      )}

      {pendingTier && (
        <div
          data-testid="sign-up-paid-tier-banner"
          data-tier={pendingTier}
          className="mb-6 w-full max-w-sm rounded-xl border border-kiln-orange/30 bg-kiln-orange/5 p-4 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-kiln-orange/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-kiln-orange">
              {paidTierName}
            </span>
          </div>
          <h2 className="mt-2 font-serif text-base text-foreground">
            {paidT("title", { tier: paidTierName })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {paidT("subtitle")}
          </p>
        </div>
      )}

      <SignUp
        appearance={{
          elements: {
            socialButtonsBlockButton: "font-medium",
          },
        }}
      />
      <p className="mt-6 text-xs text-muted-foreground">
        Sign up with email, Google, or GitHub
      </p>
    </div>
  );
}
