import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ResellerBilling } from "@/lib/billing/reseller-billing";
import { checkFeatureAccess } from "@/lib/feature-access";
import { AuditLogger } from "@/lib/audit/audit-logger";

// GET /api/reseller/clients — Alle Clients mit Billing-Status
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dashboard = await ResellerBilling.getResellerDashboard(userId);
  return NextResponse.json({ clients: dashboard?.clients || [] });
}

// POST /api/reseller/clients — Client mit Subscription erstellen
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(userId, "resellerBilling");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const body = await req.json();
  const { clientPortalId, monthlyPrice, description, trialDays } = body;

  if (!clientPortalId || !monthlyPrice) {
    return NextResponse.json({ error: "clientPortalId und monthlyPrice erforderlich" }, { status: 400 });
  }

  try {
    const result = await ResellerBilling.createClientSubscription(userId, clientPortalId, {
      monthlyPrice,
      description: description || "AI Agent Service",
      trialDays,
    });

    await AuditLogger.log({
      userId,
      category: "portal",
      action: "reseller.client_subscription_created",
      resourceId: clientPortalId,
      resourceType: "ClientPortal",
      details: { monthlyPrice, trialDays },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Subscription creation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
