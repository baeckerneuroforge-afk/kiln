/**
 * Sprint 19.7.8 — recipient preference gate for transactional email.
 *
 * Two-layer opt-out model:
 *   1. `User.emailNotifications=false` is a master kill-switch. Affects
 *      every transactional email we send to that user.
 *   2. `User.notificationPreferences` is a JSON map of `eventType → bool`.
 *      A missing key defaults to `true` (opt-in by default for new event
 *      types) so we never silently drop a new notification because we
 *      forgot to backfill preferences.
 *
 * Recipients without a User row (fresh sub-org invites for emails that
 * don't have a Clerk account yet) bypass the gate — their consent is
 * implicit in the invitation flow itself.
 *
 * eventType is the abstract event, separate from the template name, so a
 * single user toggle can govern multiple template variants (e.g.
 * `sub_org_invited` controls both the existing-user and new-email paths).
 */
import { prisma } from "@/lib/prisma";

export type EmailEventType =
  | "sub_org_invited"
  | "agency_invited"
  | "onboarding_completed";

export interface PreferenceCheckResult {
  allow: boolean;
  reason?: "no_user_row" | "master_kill_switch" | "event_disabled";
}

/**
 * Returns whether we should send the given event to the given user. Looks
 * up the User row by id when a userId is provided; falls back to email
 * lookup otherwise. Missing user row is treated as `allow=true` because
 * the email is for someone not yet in our system (invite path).
 */
export async function shouldSendEmail(args: {
  eventType: EmailEventType;
  userId?: string | null;
  recipientEmail?: string | null;
}): Promise<PreferenceCheckResult> {
  let user: {
    emailNotifications: boolean;
    notificationPreferences: unknown;
  } | null = null;

  if (args.userId) {
    user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { emailNotifications: true, notificationPreferences: true },
    });
  }
  if (!user && args.recipientEmail) {
    user = await prisma.user.findUnique({
      where: { email: args.recipientEmail },
      select: { emailNotifications: true, notificationPreferences: true },
    });
  }
  if (!user) return { allow: true, reason: "no_user_row" };

  if (!user.emailNotifications) {
    return { allow: false, reason: "master_kill_switch" };
  }

  const prefs = parsePreferences(user.notificationPreferences);
  // Missing key → default-enabled. Only an explicit `false` opts out.
  if (prefs[args.eventType] === false) {
    return { allow: false, reason: "event_disabled" };
  }
  return { allow: true };
}

export function parsePreferences(
  value: unknown,
): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}
