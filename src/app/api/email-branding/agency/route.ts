/**
 * GET   /api/email-branding/agency — load the agency-level email-branding
 *                                     fields (From-address, footer, support
 *                                     link) on top of the existing OrgBranding.
 * PATCH /api/email-branding/agency — upsert the agency-level email branding.
 *                                     Only callable from an agency-tier org.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import {
  isValidEmailAddress,
  isValidHttpsUrl,
} from "@/lib/email/branding-resolver";

export const dynamic = "force-dynamic";

interface UpdateBody {
  emailFromAddress?: string | null;
  emailFromName?: string | null;
  emailReplyTo?: string | null;
  emailFooterHtml?: string | null;
  emailSupportLink?: string | null;
}

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return Response.json({ error: "No active organization" }, { status: 400 });
  }

  const branding = await prisma.orgBranding.findUnique({
    where: { orgId },
    select: {
      emailFromAddress: true,
      emailFromName: true,
      emailReplyTo: true,
      emailFooterHtml: true,
      emailSupportLink: true,
    },
  });

  return Response.json({
    emailFromAddress: branding?.emailFromAddress ?? null,
    emailFromName: branding?.emailFromName ?? null,
    emailReplyTo: branding?.emailReplyTo ?? null,
    emailFooterHtml: branding?.emailFooterHtml ?? null,
    emailSupportLink: branding?.emailSupportLink ?? null,
  });
}

export async function PATCH(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return Response.json({ error: "No active organization" }, { status: 400 });
  }

  const allowed = await canManageSubOrgs(userId, orgId);
  if (!allowed) {
    return Response.json(
      { error: "Email branding requires AGENCY tier or higher." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  const data: UpdateBody = {};

  if (body.emailFromAddress !== undefined) {
    if (body.emailFromAddress === null || body.emailFromAddress === "") {
      data.emailFromAddress = null;
    } else if (
      typeof body.emailFromAddress === "string" &&
      isValidEmailAddress(body.emailFromAddress)
    ) {
      data.emailFromAddress = body.emailFromAddress;
    } else {
      return Response.json(
        { error: "emailFromAddress must be a valid email address" },
        { status: 400 }
      );
    }
  }
  if (body.emailFromName !== undefined) {
    data.emailFromName =
      body.emailFromName === "" ? null : (body.emailFromName as string | null);
  }
  if (body.emailReplyTo !== undefined) {
    if (body.emailReplyTo === null || body.emailReplyTo === "") {
      data.emailReplyTo = null;
    } else if (
      typeof body.emailReplyTo === "string" &&
      isValidEmailAddress(body.emailReplyTo)
    ) {
      data.emailReplyTo = body.emailReplyTo;
    } else {
      return Response.json(
        { error: "emailReplyTo must be a valid email address" },
        { status: 400 }
      );
    }
  }
  if (body.emailFooterHtml !== undefined) {
    data.emailFooterHtml =
      body.emailFooterHtml === ""
        ? null
        : (body.emailFooterHtml as string | null);
  }
  if (body.emailSupportLink !== undefined) {
    if (body.emailSupportLink === null || body.emailSupportLink === "") {
      data.emailSupportLink = null;
    } else if (
      typeof body.emailSupportLink === "string" &&
      isValidHttpsUrl(body.emailSupportLink)
    ) {
      data.emailSupportLink = body.emailSupportLink;
    } else {
      return Response.json(
        { error: "emailSupportLink must be a valid https URL" },
        { status: 400 }
      );
    }
  }

  const branding = await prisma.orgBranding.upsert({
    where: { orgId },
    update: data,
    create: { orgId, ...data },
  });

  return Response.json({
    emailFromAddress: branding.emailFromAddress,
    emailFromName: branding.emailFromName,
    emailReplyTo: branding.emailReplyTo,
    emailFooterHtml: branding.emailFooterHtml,
    emailSupportLink: branding.emailSupportLink,
  });
}
