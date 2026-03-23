/**
 * Auto Top-Up Configuration API
 * GET: Aktuelle Config laden
 * PUT: Config aktualisieren (enable/disable, amount, threshold)
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.autoTopUpConfig.findUnique({
    where: { userId },
  });

  if (!config) {
    return Response.json({
      isEnabled: false,
      creditAmount: 500,
      triggerThreshold: 50,
      maxPerMonth: 3,
      topUpsThisMonth: 0,
      stripePaymentMethodId: null,
      lastTopUpAt: null,
    });
  }

  return Response.json({
    isEnabled: config.isEnabled,
    creditAmount: config.creditAmount,
    triggerThreshold: config.triggerThreshold,
    maxPerMonth: config.maxPerMonth,
    topUpsThisMonth: config.topUpsThisMonth,
    stripePaymentMethodId: config.stripePaymentMethodId
      ? `****${config.stripePaymentMethodId.slice(-4)}`
      : null,
    lastTopUpAt: config.lastTopUpAt,
  });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { isEnabled, creditAmount, triggerThreshold, maxPerMonth, stripePaymentMethodId } = body as {
    isEnabled?: boolean;
    creditAmount?: number;
    triggerThreshold?: number;
    maxPerMonth?: number;
    stripePaymentMethodId?: string;
  };

  // Validierung
  const validAmounts = [500, 2000, 5000];
  if (creditAmount !== undefined && !validAmounts.includes(creditAmount)) {
    return Response.json(
      { error: `creditAmount muss einer von ${validAmounts.join(", ")} sein` },
      { status: 400 }
    );
  }
  if (triggerThreshold !== undefined && (triggerThreshold < 10 || triggerThreshold > 1000)) {
    return Response.json(
      { error: "triggerThreshold muss zwischen 10 und 1000 liegen" },
      { status: 400 }
    );
  }
  if (maxPerMonth !== undefined && (maxPerMonth < 1 || maxPerMonth > 10)) {
    return Response.json(
      { error: "maxPerMonth muss zwischen 1 und 10 liegen" },
      { status: 400 }
    );
  }

  // Wenn aktiviert wird, muss eine Zahlungsmethode vorhanden sein
  if (isEnabled) {
    const existing = await prisma.autoTopUpConfig.findUnique({ where: { userId } });
    const hasPM = stripePaymentMethodId || existing?.stripePaymentMethodId;
    if (!hasPM) {
      return Response.json(
        { error: "Zahlungsmethode erforderlich um Auto Top-Up zu aktivieren" },
        { status: 400 }
      );
    }
  }

  // Stripe PaymentMethod validieren (wenn neu übergeben)
  if (stripePaymentMethodId) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return Response.json({ error: "Stripe nicht konfiguriert" }, { status: 500 });
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeSecretKey);
      const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

      // Sicherstellen dass die PM zum User gehört
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true },
      });
      if (pm.customer !== user?.stripeCustomerId) {
        return Response.json(
          { error: "Zahlungsmethode gehört nicht zu diesem Account" },
          { status: 403 }
        );
      }
    } catch {
      return Response.json(
        { error: "Ungültige Zahlungsmethode" },
        { status: 400 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (isEnabled !== undefined) data.isEnabled = isEnabled;
  if (creditAmount !== undefined) data.creditAmount = creditAmount;
  if (triggerThreshold !== undefined) data.triggerThreshold = triggerThreshold;
  if (maxPerMonth !== undefined) data.maxPerMonth = maxPerMonth;
  if (stripePaymentMethodId !== undefined) data.stripePaymentMethodId = stripePaymentMethodId;

  const config = await prisma.autoTopUpConfig.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
    },
    update: data,
  });

  return Response.json({
    isEnabled: config.isEnabled,
    creditAmount: config.creditAmount,
    triggerThreshold: config.triggerThreshold,
    maxPerMonth: config.maxPerMonth,
    stripePaymentMethodId: config.stripePaymentMethodId
      ? `****${config.stripePaymentMethodId.slice(-4)}`
      : null,
    lastTopUpAt: config.lastTopUpAt,
  });
}
