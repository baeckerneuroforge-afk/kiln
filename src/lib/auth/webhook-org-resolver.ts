/**
 * Resolve an org id from external webhook subjects.
 *
 * External services (Stripe, Slack, GitHub, Telegram, …) deliver events
 * without a user/org session. We map the event's subject to a row in our
 * DB that already carries the owning user — and from there to the user's
 * personal org, which is the right tenant boundary for billing /
 * notifications / orchestration.
 *
 * Each helper returns null when the subject isn't recognised; callers
 * should treat null as "out-of-tenant event, drop or log only".
 */
import { prisma } from "@/lib/prisma";

export type WebhookOrgScope = { userId: string; orgId: string | null };

/**
 * Stripe customer → KILN user → personalOrgId. Used by /api/webhooks/stripe
 * for subscription / payment lifecycle events.
 */
export async function resolveOrgFromStripeCustomer(
  stripeCustomerId: string
): Promise<WebhookOrgScope | null> {
  if (!stripeCustomerId) return null;
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    select: { id: true, personalOrgId: true },
  });
  if (!user) return null;
  return { userId: user.id, orgId: user.personalOrgId };
}

/**
 * Stripe Connect account → ResellerAccount → user → personalOrgId. Used by
 * /api/webhooks/stripe-connect for account.updated and similar events.
 */
export async function resolveOrgFromStripeConnectAccount(
  stripeConnectAccountId: string
): Promise<WebhookOrgScope | null> {
  if (!stripeConnectAccountId) return null;
  const reseller = await prisma.resellerAccount.findUnique({
    where: { stripeConnectAccountId },
    select: { userId: true, orgId: true },
  });
  if (!reseller) return null;
  // Prefer the reseller row's own orgId (set during Phase 2.1 backfill);
  // fall back to the user's personalOrgId.
  if (reseller.orgId) return { userId: reseller.userId, orgId: reseller.orgId };
  const user = await prisma.user.findUnique({
    where: { id: reseller.userId },
    select: { personalOrgId: true },
  });
  return { userId: reseller.userId, orgId: user?.personalOrgId ?? null };
}

/**
 * Per-agent webhook (Slack, GitHub, Telegram, WhatsApp, Calendly, Email):
 * the path / target id resolves to an Agent. Use the agent's orgId.
 */
export async function resolveOrgFromAgentId(
  agentId: string
): Promise<WebhookOrgScope | null> {
  if (!agentId) return null;
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true, orgId: true },
  });
  if (!agent) return null;
  if (agent.orgId) return { userId: agent.userId, orgId: agent.orgId };
  const user = await prisma.user.findUnique({
    where: { id: agent.userId },
    select: { personalOrgId: true },
  });
  return { userId: agent.userId, orgId: user?.personalOrgId ?? null };
}

/**
 * Slug-based lookup (used by /api/webhooks/agent/[path] which slug-routes
 * to a specific agent).
 */
export async function resolveOrgFromAgentSlug(
  slug: string
): Promise<WebhookOrgScope | null> {
  if (!slug) return null;
  const agent = await prisma.agent.findUnique({
    where: { slug },
    select: { userId: true, orgId: true },
  });
  if (!agent) return null;
  if (agent.orgId) return { userId: agent.userId, orgId: agent.orgId };
  const user = await prisma.user.findUnique({
    where: { id: agent.userId },
    select: { personalOrgId: true },
  });
  return { userId: agent.userId, orgId: user?.personalOrgId ?? null };
}
