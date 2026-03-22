import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ResellerBilling } from "@/lib/billing/reseller-billing";
import { prisma } from "@/lib/prisma";

// PUT /api/reseller/clients/:clientId — Preis aktualisieren
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const body = await req.json();
  const { monthlyPrice } = body;

  if (!monthlyPrice) {
    return NextResponse.json({ error: "monthlyPrice erforderlich" }, { status: 400 });
  }

  // Sicherstellen dass der Client zum User gehört
  const sub = await prisma.clientSubscription.findUnique({
    where: { id: clientId },
    include: { resellerAccount: true },
  });
  if (!sub || sub.resellerAccount.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await ResellerBilling.updateClientPrice(sub.stripeSubscriptionId, monthlyPrice);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/reseller/clients/:clientId — Subscription kündigen
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;

  const sub = await prisma.clientSubscription.findUnique({
    where: { id: clientId },
    include: { resellerAccount: true },
  });
  if (!sub || sub.resellerAccount.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await ResellerBilling.cancelClientSubscription(sub.stripeSubscriptionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancellation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
