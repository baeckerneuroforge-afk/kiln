import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { headers } from "next/headers";
import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { loadAgencyBranding } from "@/lib/domains/agency-branding";

export const dynamic = "force-dynamic";

/**
 * Sprint 19.8.1 — agency-domain-aware sign-in.
 *
 * When the middleware detects a request on an agency custom-domain,
 * it sets `x-agency-org-id` + `x-agency-domain` headers. We use those
 * to render an agency-branded header (logo + name) above Clerk's
 * SignIn component, so the user sees consistent branding even before
 * they're authenticated.
 *
 * On kilnbase.com (no agency headers) we render the original KILN
 * brand mark — backwards compatible with the pre-19.8.1 sign-in.
 */
export default async function SignInPage() {
  const hdrs = await headers();
  const agencyOrgId = hdrs.get("x-agency-org-id");
  const hostname = hdrs.get("x-agency-domain");
  const branding = agencyOrgId && hostname
    ? await loadAgencyBranding({ agencyOrgId, hostname })
    : null;
  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      {branding ? (
        <div
          className="mb-8 flex items-center gap-3"
          data-testid="sign-in-agency-branding"
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{ borderColor: branding.primaryColor }}
          >
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.agencyName}
                className="h-7 w-7 object-contain"
              />
            ) : (
              <Building2
                className="h-5 w-5"
                style={{ color: branding.primaryColor }}
              />
            )}
          </div>
          <span className="font-serif text-xl text-foreground">
            {branding.agencyName}
          </span>
        </div>
      ) : (
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg font-serif text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
          >
            K
          </div>
          <span className="font-serif text-xl text-foreground">KILN</span>
        </Link>
      )}
      <SignIn
        appearance={{
          elements: {
            socialButtonsBlockButton: "font-medium",
          },
        }}
      />
      <p className="mt-6 text-xs text-muted-foreground">{t("signIn")}</p>
    </div>
  );
}
