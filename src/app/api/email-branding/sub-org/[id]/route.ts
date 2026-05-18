/**
 * GET   /api/email-branding/sub-org/[id] — read sub-org email override
 * PATCH /api/email-branding/sub-org/[id] — set / clear override fields
 *
 * Auth via the Sprint 20.2 agency-role helper — reads require
 * CONSULTANT+, writes require ADMIN+.
 *
 * The override is stored as a JSON bag on OrgRelationship.emailBrandOverride.
 * Empty / null values clear individual fields; passing `null` as the body
 * clears the entire override and falls back to agency-level branding.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/permissions/require-sub-org-access";
import {
  isValidEmailAddress,
  isValidHexColor,
  isValidHttpsUrl,
  parseOverride,
} from "@/lib/email/branding-resolver";
import type { EmailBrandOverride } from "@/lib/email/types";

export const dynamic = "force-dynamic";

interface PatchBody {
  enabled?: boolean;
  brandName?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  fromAddress?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  footerHtml?: string | null;
  supportLink?: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireSubOrgAccess(params.id, {
    requiredAgencyRole: ["OWNER", "ADMIN", "CONSULTANT"],
  });
  if (!access.ok) return access.response;
  const { relationship } = access;

  return Response.json({
    enabled: relationship.emailBrandOverride !== null,
    override: parseOverride(relationship.emailBrandOverride),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireSubOrgAccess(params.id, {
    requiredAgencyRole: ["OWNER", "ADMIN"],
  });
  if (!access.ok) return access.response;
  const { relationship } = access;

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  if (body.enabled === false) {
    await prisma.orgRelationship.update({
      where: { id: params.id },
      data: { emailBrandOverride: Prisma.JsonNull },
    });
    return Response.json({ enabled: false, override: null });
  }

  const current = parseOverride(relationship.emailBrandOverride) || {};
  const next: EmailBrandOverride = { ...current };

  const errors: string[] = [];

  if ("brandName" in body) {
    if (body.brandName === null || body.brandName === "") {
      delete next.brandName;
    } else if (typeof body.brandName === "string") {
      next.brandName = body.brandName;
    }
  }

  if ("logoUrl" in body) {
    if (body.logoUrl === null || body.logoUrl === "") {
      delete next.logoUrl;
    } else if (typeof body.logoUrl === "string" && isValidHttpsUrl(body.logoUrl)) {
      next.logoUrl = body.logoUrl;
    } else {
      errors.push("logoUrl must be a valid https URL");
    }
  }

  if ("brandColor" in body) {
    if (body.brandColor === null || body.brandColor === "") {
      delete next.brandColor;
    } else if (typeof body.brandColor === "string" && isValidHexColor(body.brandColor)) {
      next.brandColor = body.brandColor;
    } else {
      errors.push("brandColor must be a valid hex color");
    }
  }

  if ("fromAddress" in body) {
    if (body.fromAddress === null || body.fromAddress === "") {
      delete next.fromAddress;
    } else if (
      typeof body.fromAddress === "string" &&
      isValidEmailAddress(body.fromAddress)
    ) {
      next.fromAddress = body.fromAddress;
    } else {
      errors.push("fromAddress must be a valid email address");
    }
  }

  if ("fromName" in body) {
    if (body.fromName === null || body.fromName === "") {
      delete next.fromName;
    } else if (typeof body.fromName === "string") {
      next.fromName = body.fromName;
    }
  }

  if ("replyTo" in body) {
    if (body.replyTo === null || body.replyTo === "") {
      delete next.replyTo;
    } else if (
      typeof body.replyTo === "string" &&
      isValidEmailAddress(body.replyTo)
    ) {
      next.replyTo = body.replyTo;
    } else {
      errors.push("replyTo must be a valid email address");
    }
  }

  if ("footerHtml" in body) {
    if (body.footerHtml === null || body.footerHtml === "") {
      delete next.footerHtml;
    } else if (typeof body.footerHtml === "string") {
      next.footerHtml = body.footerHtml;
    }
  }

  if ("supportLink" in body) {
    if (body.supportLink === null || body.supportLink === "") {
      delete next.supportLink;
    } else if (
      typeof body.supportLink === "string" &&
      isValidHttpsUrl(body.supportLink)
    ) {
      next.supportLink = body.supportLink;
    } else {
      errors.push("supportLink must be a valid https URL");
    }
  }

  if (errors.length > 0) {
    return Response.json({ error: errors.join("; ") }, { status: 400 });
  }

  const updated = await prisma.orgRelationship.update({
    where: { id: params.id },
    data: { emailBrandOverride: next as object },
    select: { emailBrandOverride: true },
  });

  return Response.json({
    enabled: true,
    override: parseOverride(updated.emailBrandOverride),
  });
}
