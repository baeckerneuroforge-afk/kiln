import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

/**
 * ResellerBilling — Stripe Connect für Agencies.
 * Agencies verkaufen AI Agent-Services an Kunden.
 * KILN nimmt eine Platform Fee (default 20%).
 */
export class ResellerBilling {

  /**
   * Erstellt einen Stripe Connect Express Account für die Agency.
   * Gibt die Onboarding-URL zurück.
   */
  static async setupConnectAccount(
    agencyUserId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ accountId: string; onboardingUrl: string }> {
    const stripe = getStripe();

    // Prüfen ob schon ein Account existiert
    const existing = await prisma.resellerAccount.findUnique({
      where: { userId: agencyUserId },
    });

    let accountId: string;

    if (existing) {
      accountId = existing.stripeConnectAccountId;
    } else {
      // Neuen Connect Express Account erstellen
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { kilnUserId: agencyUserId },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      await prisma.resellerAccount.create({
        data: {
          userId: agencyUserId,
          stripeConnectAccountId: accountId,
          stripeConnectStatus: "pending",
        },
      });
    }

    // Onboarding-Link generieren
    const link = await stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: "account_onboarding",
    });

    return { accountId, onboardingUrl: link.url };
  }

  /**
   * Prüft den Status des Connect Accounts und aktualisiert die DB.
   */
  static async syncAccountStatus(agencyUserId: string): Promise<string> {
    const reseller = await prisma.resellerAccount.findUnique({
      where: { userId: agencyUserId },
    });
    if (!reseller) return "not_found";

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(reseller.stripeConnectAccountId);

    const status = account.charges_enabled && account.payouts_enabled
      ? "active"
      : account.details_submitted
        ? "pending"
        : "pending";

    if (status !== reseller.stripeConnectStatus) {
      await prisma.resellerAccount.update({
        where: { id: reseller.id },
        data: { stripeConnectStatus: status },
      });
    }

    return status;
  }

  /**
   * Erstellt ein Subscription für einen Client-Portal-Kunden.
   * Nutzt Stripe Connect Destination Charges.
   */
  static async createClientSubscription(
    agencyUserId: string,
    clientPortalId: string,
    priceConfig: { monthlyPrice: number; description: string; trialDays?: number },
  ): Promise<{ subscriptionId: string; clientSecret?: string }> {
    const stripe = getStripe();

    const reseller = await prisma.resellerAccount.findUnique({
      where: { userId: agencyUserId },
    });
    if (!reseller || reseller.stripeConnectStatus !== "active") {
      throw new Error("Reseller account is not active");
    }

    const portal = await prisma.clientPortal.findUnique({
      where: { id: clientPortalId },
    });
    if (!portal) throw new Error("Client portal not found");

    // Stripe Customer für den Client erstellen
    const customer = await stripe.customers.create({
      email: portal.clientEmail,
      name: portal.clientName || undefined,
      metadata: {
        kilnPortalId: clientPortalId,
        kilnAgencyUserId: agencyUserId,
      },
    });

    // Produkt + Preis erstellen
    const product = await stripe.products.create({
      name: priceConfig.description || `AI Agent Service — ${portal.name}`,
      metadata: { kilnPortalId: clientPortalId },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceConfig.monthlyPrice,
      currency: "eur",
      recurring: { interval: "month" },
    });

    // Platform Fee berechnen
    const platformFeeCents = Math.round(
      priceConfig.monthlyPrice * (reseller.platformFeePercent / 100),
    );

    // Subscription mit Destination Charge erstellen
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      trial_period_days: priceConfig.trialDays,
      transfer_data: {
        destination: reseller.stripeConnectAccountId,
      },
      application_fee_percent: reseller.platformFeePercent,
      metadata: {
        kilnPortalId: clientPortalId,
        kilnResellerId: reseller.id,
      },
    });

    // In DB speichern
    await prisma.clientSubscription.create({
      data: {
        clientPortalId,
        resellerAccountId: reseller.id,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customer.id,
        monthlyPriceCents: priceConfig.monthlyPrice,
        platformFeeCents,
        status: subscription.status === "trialing" ? "trialing" : "active",
        currentPeriodStart: new Date(((subscription as unknown as Record<string, number>).current_period_start || 0) * 1000),
        currentPeriodEnd: new Date(((subscription as unknown as Record<string, number>).current_period_end || 0) * 1000),
      },
    });

    return { subscriptionId: subscription.id };
  }

  /**
   * Lädt das Reseller-Dashboard mit Revenue-Daten.
   */
  static async getResellerDashboard(agencyUserId: string) {
    const reseller = await prisma.resellerAccount.findUnique({
      where: { userId: agencyUserId },
      include: {
        clientSubscriptions: {
          include: {
            clientPortal: { select: { name: true, clientName: true, clientEmail: true } },
          },
        },
      },
    });
    if (!reseller) return null;

    const activeSubscriptions = reseller.clientSubscriptions.filter(
      (s) => s.status === "active" || s.status === "trialing",
    );

    const mrr = activeSubscriptions.reduce((sum, s) => sum + s.monthlyPriceCents, 0);
    const mrrFees = activeSubscriptions.reduce((sum, s) => sum + s.platformFeeCents, 0);
    const netMrr = mrr - mrrFees;

    const clients = reseller.clientSubscriptions.map((sub) => ({
      id: sub.id,
      portalId: sub.clientPortalId,
      clientName: sub.clientPortal.clientName || sub.clientPortal.clientEmail,
      portalName: sub.clientPortal.name,
      monthlyPrice: sub.monthlyPriceCents,
      platformFee: sub.platformFeeCents,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      canceledAt: sub.canceledAt,
    }));

    return {
      accountStatus: reseller.stripeConnectStatus,
      platformFeePercent: reseller.platformFeePercent,
      totalRevenue: reseller.totalRevenueCents,
      totalFeesPaid: reseller.totalFeePaidCents,
      mrr,
      mrrFees,
      netMrr,
      activeClients: activeSubscriptions.length,
      totalClients: reseller.clientSubscriptions.length,
      clients,
    };
  }

  /**
   * Aktualisiert den Preis für einen Client.
   */
  static async updateClientPrice(subscriptionId: string, newPriceCents: number) {
    const stripe = getStripe();

    const sub = await prisma.clientSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { resellerAccount: true },
    });
    if (!sub) throw new Error("Subscription not found");

    // Neuen Preis in Stripe erstellen
    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
    const oldItem = stripeSub.items.data[0];

    const newPrice = await stripe.prices.create({
      product: oldItem.price.product as string,
      unit_amount: newPriceCents,
      currency: "eur",
      recurring: { interval: "month" },
    });

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: oldItem.id, price: newPrice.id }],
      proration_behavior: "create_prorations",
    });

    const newFeeCents = Math.round(
      newPriceCents * (sub.resellerAccount.platformFeePercent / 100),
    );

    await prisma.clientSubscription.update({
      where: { id: sub.id },
      data: { monthlyPriceCents: newPriceCents, platformFeeCents: newFeeCents },
    });
  }

  /**
   * Kündigt ein Client-Subscription.
   */
  static async cancelClientSubscription(subscriptionId: string) {
    const stripe = getStripe();

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.clientSubscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: "canceled", canceledAt: new Date() },
    });
  }

  /**
   * Verarbeitet Stripe Connect Webhooks.
   */
  static async handleConnectWebhook(event: Stripe.Event) {
    switch (event.type) {
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as Record<string, unknown>).subscription as string;
        if (!subId) break;

        const sub = await prisma.clientSubscription.findUnique({
          where: { stripeSubscriptionId: subId },
        });
        if (!sub) break;

        // Revenue tracking aktualisieren
        const amount = invoice.amount_paid || 0;
        const fee = Math.round(amount * 0.2); // Approximation

        await prisma.resellerAccount.update({
          where: { id: sub.resellerAccountId },
          data: {
            totalRevenueCents: { increment: amount },
            totalFeePaidCents: { increment: fee },
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as Record<string, unknown>).subscription as string;
        if (!subId) break;

        await prisma.clientSubscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: "past_due" },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.clientSubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "canceled", canceledAt: new Date() },
        });
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const status = account.charges_enabled && account.payouts_enabled
          ? "active"
          : "pending";

        await prisma.resellerAccount.updateMany({
          where: { stripeConnectAccountId: account.id },
          data: { stripeConnectStatus: status },
        });
        break;
      }
    }
  }
}
