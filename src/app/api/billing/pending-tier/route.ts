/**
 * Sprint 20.1.1 — Read-and-clear the kiln-pending-tier cookie.
 *
 * Called by the PendingTierHandler client component on first dashboard
 * mount. Returns the cookie value when present + valid, then clears
 * it in the same response so a refresh doesn't fire a second
 * Stripe Checkout session.
 *
 * Auth-required so an unauthenticated request can't probe whether a
 * given browser has a pending tier. Doesn't validate ownership of the
 * cookie — the cookie is per-browser, not per-user, by design (it's
 * set before sign-up completes so we can't bind it to a userId).
 *
 * Response shape:
 *   200 { pendingTier: "starter" | "professional" | "agency_pro" | null }
 *   401 when no Clerk session
 *
 * The clear is unconditional — we set the cookie to empty with
 * maxAge=0 on every call so a stale-but-invalid value (someone fiddled
 * with their cookie jar) also gets removed.
 */

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import {
  PENDING_TIER_COOKIE,
  isPendingTier,
} from "@/lib/billing/pending-tier";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const raw = jar.get(PENDING_TIER_COOKIE)?.value ?? null;
  const pendingTier = isPendingTier(raw) ? raw : null;

  // Clear unconditionally — see JSDoc.
  if (raw) {
    jar.set(PENDING_TIER_COOKIE, "", { maxAge: 0, path: "/" });
  }

  return Response.json({ pendingTier });
}
