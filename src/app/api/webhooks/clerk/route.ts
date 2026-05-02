/**
 * Clerk webhook handler — Phase 2.1: auto-provision a Personal workspace
 * organization for every new user.
 *
 * Configure in the Clerk Dashboard → Webhooks. Subscribe to:
 *   - user.created
 *   - organization.created (optional — kept here for future analytics)
 *   - organizationMembership.created (optional)
 *   - organization.deleted (optional)
 *
 * Required env: CLERK_WEBHOOK_SECRET (Svix signing secret from Clerk).
 *
 * The handler is idempotent — Clerk retries failed webhooks, and a re-run for
 * a user that already has a personalOrgId is a no-op.
 */
import type { NextRequest } from "next/server";
import { Webhook } from "svix";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ClerkEmailAddress = { email_address?: string };
type ClerkUserCreatedData = {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};
type ClerkEvent = { type: string; data: unknown };

export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const rawBody = await request.text();
  let evt: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    console.error("[clerk-webhook] signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    switch (evt.type) {
      case "user.created":
        await handleUserCreated(evt.data as ClerkUserCreatedData);
        break;
      case "organization.created":
      case "organizationMembership.created":
      case "organization.deleted":
      case "user.deleted":
        // Acknowledged but no-op for now — kept here so subscribed events
        // still 200 instead of returning 'unknown event' which would make
        // Clerk's retry behaviour noisy.
        break;
      default:
        // Unknown but harmless — return 200 so Clerk doesn't retry forever.
        break;
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[clerk-webhook] failed to handle ${evt.type}:`, err);
    // 500 → Clerk retries with exponential backoff, which is the behavior
    // we want for transient DB / Clerk-API failures.
    return Response.json({ error: "Handler failed" }, { status: 500 });
  }
}

/**
 * On user.created: ensure the user has a Personal workspace org.
 * Idempotent — if personalOrgId already exists in our DB, do nothing.
 */
async function handleUserCreated(data: ClerkUserCreatedData) {
  const userId = data.id;
  if (!userId) return;

  const email = data.email_addresses?.[0]?.email_address ?? null;

  // Check our DB first — if backfill already provisioned an org for this user,
  // skip. Webhooks may arrive out of order or duplicate.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalOrgId: true, email: true },
  });
  if (existing?.personalOrgId) {
    return;
  }

  const orgName = buildPersonalOrgName(data);
  const client = await clerkClient();
  const org = await client.organizations.createOrganization({
    name: orgName,
    createdBy: userId,
  });

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: email ?? `${userId}@no-email.local`,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      personalOrgId: org.id,
    },
    update: {
      personalOrgId: org.id,
      ...(email ? { email } : {}),
      ...(data.first_name !== undefined ? { firstName: data.first_name } : {}),
      ...(data.last_name !== undefined ? { lastName: data.last_name } : {}),
    },
  });
}

function buildPersonalOrgName(data: ClerkUserCreatedData): string {
  const first = data.first_name?.trim();
  const last = data.last_name?.trim();
  if (first || last) {
    return `${[first, last].filter(Boolean).join(" ")}'s Workspace`;
  }
  if (data.username) {
    return `${data.username}'s Workspace`;
  }
  const local = data.email_addresses?.[0]?.email_address?.split("@")[0];
  if (local) {
    return `${local}'s Workspace`;
  }
  return "Personal Workspace";
}
