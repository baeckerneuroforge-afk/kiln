/**
 * Sprint 19.7.6 — sub-org onboarding wizard state.
 *
 * POST /api/sub-orgs/[id]/onboarding
 *
 * Body shapes accepted:
 *   { step: 1 | 2 | 3 }                — mark step as completed
 *   { completed: true }                — mark whole wizard as completed
 *   { skip: true }                     — set 24h skip cookie; doesn't
 *                                          touch the DB. The wizard
 *                                          stays unfinished and shows
 *                                          again after the cookie
 *                                          expires.
 *
 * Auth: caller must have a SubOrgMembership for this sub-org. We don't
 * gate on a specific permission — the wizard is for the user editing
 * their own onboarding state.
 */
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";
import {
  ONBOARDING_SKIP_COOKIE,
  ONBOARDING_SKIP_MAX_AGE_SECONDS,
} from "@/lib/sub-org/onboarding-redirect";
import { sendBrandedEmail } from "@/lib/email/send-branded-email";
import { shouldSendEmail } from "@/lib/email/preferences";
import { resolveLocale } from "@/lib/email/i18n";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getUserSubOrgMembership(userId, params.id);
  if (!membership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    step?: unknown;
    completed?: unknown;
    skip?: unknown;
  };

  if (body.skip === true) {
    const cookieStore = await cookies();
    cookieStore.set(ONBOARDING_SKIP_COOKIE, "1", {
      maxAge: ONBOARDING_SKIP_MAX_AGE_SECONDS,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return Response.json({ ok: true, action: "skipped" });
  }

  if (body.completed === true) {
    // Avoid re-sending a completion email on a redundant POST. Only mark
    // & notify when this is the first completion for the row.
    const wasAlreadyCompleted = membership.onboardingCompletedAt !== null;
    await prisma.subOrgMembership.update({
      where: { id: membership.id },
      data: {
        onboardingCompletedAt: new Date(),
        onboardingStepCompleted: 3,
      },
    });

    if (!wasAlreadyCompleted) {
      try {
        const relationship = await prisma.orgRelationship.findUnique({
          where: { id: params.id },
          select: {
            parentOrgId: true,
            childOrgId: true,
            subOrgName: true,
          },
        });
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            preferredLanguage: true,
          },
        });
        if (relationship && user?.email) {
          const gate = await shouldSendEmail({
            eventType: "onboarding_completed",
            userId,
            recipientEmail: user.email,
          });
          if (gate.allow) {
            const locale = resolveLocale(user.preferredLanguage);
            const recipientName =
              [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
            await sendBrandedEmail({
              template: "sub-org-onboarding-completed",
              orgId: relationship.parentOrgId,
              subOrgId: relationship.childOrgId,
              userId,
              to: user.email,
              data: {
                locale,
                recipientName,
                subOrgName: relationship.subOrgName ?? "your workspace",
                dashboardUrl: `${appUrl}/dashboard/sub-org/${params.id}`,
              },
            });
          }
        }
      } catch (err) {
        console.warn("[sub-org/onboarding] completion email failed:", err);
      }
    }

    return Response.json({ ok: true, action: "completed" });
  }

  if (body.step === 1 || body.step === 2 || body.step === 3) {
    await prisma.subOrgMembership.update({
      where: { id: membership.id },
      data: { onboardingStepCompleted: body.step },
    });
    return Response.json({ ok: true, action: "step", step: body.step });
  }

  return Response.json({ error: "Invalid payload" }, { status: 400 });
}
