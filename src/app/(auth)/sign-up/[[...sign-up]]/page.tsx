import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Sprint 20 — `?tier=free` query param opt-in.
 *
 * When the marketing pricing-page CTA links here with `?tier=free`, we
 * show a small banner above Clerk's signup form so the visitor knows
 * they're committing to the Free Plan and don't get cold feet at the
 * email-input step. No actual plan switching happens here — all users
 * start on FREE via User.plan default in the schema; the banner is
 * purely a confidence-building UX prompt.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const params = await searchParams;
  const showFreeBanner = params.tier === "free";
  const t = await getTranslations("billing.freePlan");

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
              {t("label")}
            </span>
          </div>
          <h2 className="mt-2 font-serif text-base text-foreground">
            {t("signUpBannerTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("signUpBannerSubtitle")}
          </p>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>• {t("signUpBannerBullets.agents")}</li>
            <li>• {t("signUpBannerBullets.conversations")}</li>
            <li>• {t("signUpBannerBullets.subOrgs")}</li>
            <li>• {t("signUpBannerBullets.storage")}</li>
          </ul>
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
