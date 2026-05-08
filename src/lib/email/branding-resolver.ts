import { prisma } from "@/lib/prisma";
import {
  KILN_DEFAULT_BRANDING,
  type EmailBranding,
  type EmailBrandOverride,
} from "./types";

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ResolveEmailBrandingArgs {
  orgId: string | null;
  subOrgId?: string | null;
}

/**
 * Resolve effective email branding for a given org / sub-org pair.
 *
 *   subOrgId set → load OrgRelationship.emailBrandOverride
 *                  + parent agency's OrgBranding via parentOrgId
 *   subOrgId unset → load orgId's own OrgBranding
 *
 * Merge precedence (highest wins): SubOrg-override → Agency OrgBranding →
 * KILN defaults. Unset / invalid fields fall through. The returned struct
 * is fully populated so callers never have to handle nulls (apart from
 * logoUrl/replyTo/supportLink which can legitimately be null).
 */
export async function resolveEmailBranding(
  args: ResolveEmailBrandingArgs
): Promise<EmailBranding> {
  let agencyBranding: AgencyBrandingRow | null = null;
  let subOrgOverride: EmailBrandOverride | null = null;

  if (args.subOrgId) {
    const relationship = await prisma.orgRelationship.findUnique({
      where: { childOrgId: args.subOrgId },
      select: {
        parentOrgId: true,
        subOrgName: true,
        brandColor: true,
        logoUrl: true,
        emailBrandOverride: true,
      },
    });

    if (relationship) {
      subOrgOverride = parseOverride(relationship.emailBrandOverride);
      agencyBranding = await loadAgencyBranding(relationship.parentOrgId);
      // Per-sub-org legacy fields (brandColor, logoUrl, subOrgName) form
      // an implicit override layer between agency and explicit override.
      const legacyLayer: EmailBrandOverride = {};
      if (relationship.brandColor && HEX_COLOR_REGEX.test(relationship.brandColor)) {
        legacyLayer.brandColor = relationship.brandColor;
      }
      if (relationship.logoUrl && isHttpsUrl(relationship.logoUrl)) {
        legacyLayer.logoUrl = relationship.logoUrl;
      }
      if (relationship.subOrgName) {
        legacyLayer.brandName = relationship.subOrgName;
      }
      const merged = mergeOverrides(legacyLayer, subOrgOverride);
      return mergeBranding(agencyBranding, merged);
    }
  }

  if (args.orgId) {
    agencyBranding = await loadAgencyBranding(args.orgId);
  }

  return mergeBranding(agencyBranding, subOrgOverride);
}

interface AgencyBrandingRow {
  agencyName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  emailFromAddress: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  emailFooterHtml: string | null;
  emailSupportLink: string | null;
}

async function loadAgencyBranding(orgId: string): Promise<AgencyBrandingRow | null> {
  return prisma.orgBranding.findUnique({
    where: { orgId },
    select: {
      agencyName: true,
      logoUrl: true,
      primaryColor: true,
      emailFromAddress: true,
      emailFromName: true,
      emailReplyTo: true,
      emailFooterHtml: true,
      emailSupportLink: true,
    },
  });
}

function mergeBranding(
  agency: AgencyBrandingRow | null,
  override: EmailBrandOverride | null
): EmailBranding {
  const candidate: EmailBranding = { ...KILN_DEFAULT_BRANDING };

  if (agency) {
    if (agency.agencyName) candidate.brandName = agency.agencyName;
    if (agency.logoUrl && isHttpsUrl(agency.logoUrl)) candidate.logoUrl = agency.logoUrl;
    if (agency.primaryColor && HEX_COLOR_REGEX.test(agency.primaryColor)) {
      candidate.brandColor = agency.primaryColor;
    }
    if (agency.emailFromAddress && EMAIL_REGEX.test(agency.emailFromAddress)) {
      candidate.fromAddress = agency.emailFromAddress;
    }
    if (agency.emailFromName) candidate.fromName = agency.emailFromName;
    if (agency.emailReplyTo && EMAIL_REGEX.test(agency.emailReplyTo)) {
      candidate.replyTo = agency.emailReplyTo;
    }
    if (agency.emailFooterHtml) candidate.footerHtml = agency.emailFooterHtml;
    if (agency.emailSupportLink && isHttpsUrl(agency.emailSupportLink)) {
      candidate.supportLink = agency.emailSupportLink;
    }
  }

  if (override) {
    if (override.brandName) candidate.brandName = override.brandName;
    if (override.logoUrl && isHttpsUrl(override.logoUrl)) candidate.logoUrl = override.logoUrl;
    if (override.brandColor && HEX_COLOR_REGEX.test(override.brandColor)) {
      candidate.brandColor = override.brandColor;
    }
    if (override.fromAddress && EMAIL_REGEX.test(override.fromAddress)) {
      candidate.fromAddress = override.fromAddress;
    }
    if (override.fromName) candidate.fromName = override.fromName;
    if (override.replyTo && EMAIL_REGEX.test(override.replyTo)) {
      candidate.replyTo = override.replyTo;
    }
    if (override.footerHtml) candidate.footerHtml = override.footerHtml;
    if (override.supportLink && isHttpsUrl(override.supportLink)) {
      candidate.supportLink = override.supportLink;
    }
  }

  candidate.isDefaultBranding = isEqualBranding(candidate, KILN_DEFAULT_BRANDING);
  return candidate;
}

function mergeOverrides(
  base: EmailBrandOverride,
  top: EmailBrandOverride | null
): EmailBrandOverride {
  if (!top) return base;
  const out: EmailBrandOverride = { ...base };
  for (const [key, v] of Object.entries(top)) {
    if (v !== undefined && v !== null && v !== "") {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

export function parseOverride(value: unknown): EmailBrandOverride | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result: EmailBrandOverride = {};
  if (typeof record.brandName === "string") result.brandName = record.brandName;
  if (typeof record.logoUrl === "string") result.logoUrl = record.logoUrl;
  if (typeof record.brandColor === "string") result.brandColor = record.brandColor;
  if (typeof record.fromAddress === "string") result.fromAddress = record.fromAddress;
  if (typeof record.fromName === "string") result.fromName = record.fromName;
  if (typeof record.replyTo === "string") result.replyTo = record.replyTo;
  if (typeof record.footerHtml === "string") result.footerHtml = record.footerHtml;
  if (typeof record.supportLink === "string") result.supportLink = record.supportLink;
  return result;
}

function isEqualBranding(a: EmailBranding, b: EmailBranding): boolean {
  return (
    a.brandName === b.brandName &&
    a.logoUrl === b.logoUrl &&
    a.brandColor === b.brandColor &&
    a.fromAddress === b.fromAddress &&
    a.fromName === b.fromName &&
    a.replyTo === b.replyTo &&
    a.footerHtml === b.footerHtml &&
    a.supportLink === b.supportLink
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export function isValidHttpsUrl(value: string): boolean {
  return isHttpsUrl(value);
}

export function formatFromHeader(branding: EmailBranding): string {
  return `${branding.fromName} <${branding.fromAddress}>`;
}
