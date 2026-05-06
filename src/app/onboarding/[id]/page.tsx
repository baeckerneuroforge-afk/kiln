/**
 * White-labeled onboarding page for sub-org customers.
 *
 * URL: /onboarding/[id] where [id] is the OrgRelationship cuid. The
 * cuid is unguessable so the link itself acts as the access token —
 * the agency can share the URL with their client and skip a separate
 * invite-token model.
 *
 * Server-rendered. Loads the relationship + the parent agency's
 * branding + Stripe Connect status, then branches:
 *
 *   - FIXED + Connect onboarded:  shows pricing breakdown, button
 *                                 triggers Stripe Checkout via the
 *                                 existing /checkout endpoint.
 *   - FIXED + Connect pending:    "Coming soon" copy, ask the agency
 *                                 to finish Stripe onboarding.
 *   - CUSTOM:                     shows pricing as display-only with
 *                                 "[Agency] will invoice you separately."
 *   - NONE:                       no pricing block; CTA to dashboard.
 *
 * Branding: pulls OrgBranding for the parent agency. When a logo +
 * agencyName + showAgencyLogo=true exist, the page renders the
 * agency identity instead of KILN's. Footer always shows the
 * "powered by KILN" line per Phase 2.3b agreement.
 *
 * Custom-domain routing: this page can also be served from an
 * agency's custom domain via the existing middleware that resolves
 * <agency-domain>/* → the agency's content. The page itself doesn't
 * care which domain serves it — branding is org-scoped, not URL-scoped.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OnboardingActivateButton } from "./activate-button";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function SubOrgOnboardingPage({ params }: Params) {
  const { id } = await params;

  const relationship = await prisma.orgRelationship.findUnique({
    where: { id },
    select: {
      id: true,
      childOrgId: true,
      parentOrgId: true,
      subOrgName: true,
      subOrgStatus: true,
      pricingMode: true,
      monthlyPriceCents: true,
      setupFeeCents: true,
      trialDays: true,
      pricingCurrency: true,
      stripeMonthlyPriceId: true,
    },
  });
  if (!relationship || relationship.subOrgStatus !== "ACTIVE") {
    notFound();
  }

  const [branding, connect] = await Promise.all([
    prisma.orgBranding.findUnique({
      where: { orgId: relationship.parentOrgId },
      select: {
        agencyName: true,
        logoUrl: true,
        primaryColor: true,
        showAgencyLogo: true,
      },
    }),
    prisma.agencyStripeAccount.findUnique({
      where: { orgId: relationship.parentOrgId },
      select: { onboardingComplete: true },
    }),
  ]);

  const agencyName = branding?.agencyName ?? "Your agency";
  const showLogo = branding?.showAgencyLogo !== false;
  const accent = branding?.primaryColor ?? "#F97316";

  const checkoutReady =
    relationship.pricingMode === "FIXED" &&
    Boolean(relationship.stripeMonthlyPriceId) &&
    Boolean(connect?.onboardingComplete);

  const currency = (relationship.pricingCurrency ?? "eur").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Branded header. Agency identity replaces KILN's mark. */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          {showLogo && branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={agencyName}
              className="h-8 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg font-serif text-base font-bold text-white"
              style={{ background: accent }}
            >
              {agencyName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-serif text-lg text-foreground">
            {agencyName}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-serif text-3xl text-foreground">
          Welcome to {relationship.subOrgName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Activate your workspace to get started.
        </p>

        <div className="mt-8 space-y-6">
          {relationship.pricingMode === "NONE" && (
            <FreePanel relationshipId={relationship.id} accent={accent} />
          )}

          {relationship.pricingMode === "FIXED" && (
            <PricingPanel
              setupFeeCents={relationship.setupFeeCents}
              monthlyPriceCents={relationship.monthlyPriceCents}
              trialDays={relationship.trialDays}
              currency={currency}
              accent={accent}
              checkoutReady={checkoutReady}
              relationshipId={relationship.id}
              agencyName={agencyName}
              mode="FIXED"
            />
          )}

          {relationship.pricingMode === "CUSTOM" && (
            <PricingPanel
              setupFeeCents={relationship.setupFeeCents}
              monthlyPriceCents={relationship.monthlyPriceCents}
              trialDays={null}
              currency={currency}
              accent={accent}
              checkoutReady={false}
              relationshipId={relationship.id}
              agencyName={agencyName}
              mode="CUSTOM"
            />
          )}
        </div>
      </main>

      {/* "Powered by" footer — small, dim. KILN identity preserved
          here per the Phase 2.3b white-label agreement. */}
      <footer className="border-t border-border py-6">
        <p className="mx-auto max-w-3xl px-6 text-center text-[11px] text-muted-foreground">
          Powered by{" "}
          <Link
            href="https://kiln.ai"
            className="font-medium hover:text-foreground"
          >
            KILN
          </Link>
        </p>
      </footer>
    </div>
  );
}

/* ── Mode panels ────────────────────────────────────────────────────── */

function FreePanel({
  relationshipId,
  accent,
}: {
  relationshipId: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">
        Your workspace is ready
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No subscription needed. Sign in to access your dashboard.
      </p>
      <Link
        href={`/sign-in?redirect_url=${encodeURIComponent(
          `/dashboard?onboarding=${relationshipId}`
        )}`}
        className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: accent }}
      >
        Continue to dashboard →
      </Link>
    </div>
  );
}

function PricingPanel({
  setupFeeCents,
  monthlyPriceCents,
  trialDays,
  currency,
  accent,
  checkoutReady,
  relationshipId,
  agencyName,
  mode,
}: {
  setupFeeCents: number | null;
  monthlyPriceCents: number | null;
  trialDays: number | null;
  currency: string;
  accent: string;
  checkoutReady: boolean;
  relationshipId: string;
  agencyName: string;
  mode: "FIXED" | "CUSTOM";
}) {
  const setup = setupFeeCents ?? 0;
  const monthly = monthlyPriceCents ?? 0;
  const trial = trialDays ?? 0;
  const dueToday = trial > 0 ? setup : setup + monthly;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Subscription</h2>

      <dl className="mt-4 space-y-2 text-sm">
        {setup > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Setup-Pauschale</dt>
            <dd className="font-mono text-foreground">
              {formatMoney(setup, currency)}
            </dd>
          </div>
        )}
        {monthly > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Monatliche Lizenz
              {trial > 0 ? ` (nach ${trial}-Tage-Trial)` : ""}
            </dt>
            <dd className="font-mono text-foreground">
              {formatMoney(monthly, currency)} / Monat
            </dd>
          </div>
        )}
        {(setup > 0 || monthly > 0) && (
          <>
            <div className="my-3 border-t border-border" />
            <div className="flex items-center justify-between text-base">
              <dt className="font-medium text-foreground">
                {trial > 0 ? "Heute fällig (Setup):" : "Heute fällig:"}
              </dt>
              <dd className="font-mono font-semibold text-foreground">
                {formatMoney(dueToday, currency)}
              </dd>
            </div>
            {monthly > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <dt>
                  Ab Tag {trial > 0 ? trial + 1 : 31}:
                </dt>
                <dd className="font-mono">
                  {formatMoney(monthly, currency)} / Monat
                </dd>
              </div>
            )}
          </>
        )}
      </dl>

      <div className="mt-6">
        {mode === "FIXED" && checkoutReady ? (
          <OnboardingActivateButton
            relationshipId={relationshipId}
            accent={accent}
          />
        ) : mode === "FIXED" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
            Coming soon — checkout is being prepared. Please contact{" "}
            {agencyName} for activation.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Billing is handled by {agencyName} separately. They will
            invoice you outside KILN.
          </div>
        )}
      </div>
    </div>
  );
}

function formatMoney(cents: number, currency: string) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency,
  });
}
