/**
 * Post-checkout landing page. Stripe redirects here on successful
 * payment. The actual subscription row is provisioned by the
 * connect webhook (customer.subscription.created), so this page
 * just confirms + sends the customer onward to sign-in / dashboard.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function OnboardingSuccessPage({ params }: Params) {
  const { id } = await params;
  const relationship = await prisma.orgRelationship.findUnique({
    where: { id },
    select: { subOrgName: true, parentOrgId: true },
  });
  if (!relationship) notFound();

  const branding = await prisma.orgBranding.findUnique({
    where: { orgId: relationship.parentOrgId },
    select: { agencyName: true, primaryColor: true },
  });
  const accent = branding?.primaryColor ?? "#F97316";
  const agencyName = branding?.agencyName ?? "your agency";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}20` }}
        >
          <CheckCircle2 className="h-6 w-6" style={{ color: accent }} />
        </div>
        <h1 className="font-serif text-2xl text-foreground">
          You&apos;re all set
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {relationship.subOrgName} is now active. {agencyName} will reach
          out with your sign-in details if you don&apos;t have an account
          yet.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          Sign in →
        </Link>
      </div>
    </div>
  );
}
