import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ResellerBilling } from "@/lib/billing/reseller-billing";
import { checkFeatureAccess } from "@/lib/feature-access";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { resolveSafeOrigin } from "@/lib/safe-origin";

// GET /api/reseller — Reseller Dashboard Daten
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(userId, "resellerBilling");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const dashboard = await ResellerBilling.getResellerDashboard(userId);
  return NextResponse.json({ dashboard });
}

// POST /api/reseller — Stripe Connect Setup starten
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(userId, "resellerBilling");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const body = await req.json();
  // Open-Redirect-Schutz: client-gelieferte origin gegen Allowlist validieren,
  // bevor sie in die Stripe-Connect-Return-URLs einfließt.
  const origin = resolveSafeOrigin(body.origin);

  const result = await ResellerBilling.setupConnectAccount(
    userId,
    `${origin}/dashboard/reseller?setup=complete`,
    `${origin}/dashboard/reseller?setup=refresh`,
  );

  await AuditLogger.log({
    userId,
    category: "settings",
    action: "reseller.connect_started",
    details: { accountId: result.accountId },
  });

  return NextResponse.json(result);
}
