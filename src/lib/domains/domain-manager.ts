/**
 * Sprint 19.8 — Custom-domain orchestrator.
 *
 * Bridges the API routes / UI to two systems that must stay in sync:
 *   1. Vercel project domains (DNS verification + Let's Encrypt SSL)
 *   2. KILN's CustomDomain table (hostname → subOrgId mapping)
 *
 * Every public method follows the same shape: it does the Vercel call
 * first, then mirrors the resulting state into our DB. If Vercel fails
 * we return early with a structured error so the caller can decide
 * whether to retry or surface the message — we never leave Vercel and
 * the DB in conflicting states.
 *
 * Errors are returned as `{ ok: false, error, code? }` for ergonomic
 * `if (!result.ok) return ...` patterns at call sites.
 */
import type { CustomDomain, CustomDomainStatus, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  type VercelDomainClient,
  type VercelDomainRecord,
  vercelDomainClientFromEnv,
} from "./vercel-domain-client";
import { validateHostname } from "./hostname";

export interface DomainManagerDeps {
  prisma?: Pick<PrismaClient, "customDomain" | "orgRelationship">;
  vercel?: VercelDomainClient;
}

export type CreateCustomDomainResult =
  | {
      ok: true;
      domain: CustomDomain;
      verification: VercelDomainRecord["verification"] | null;
    }
  | { ok: false; error: string; code?: string };

export type VerifyDomainResult =
  | { ok: true; domain: CustomDomain }
  | { ok: false; error: string; code?: string };

export type RemoveDomainResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function mapVerifiedToStatus(verified: boolean | undefined): CustomDomainStatus {
  return verified ? "ACTIVE" : "VERIFYING";
}

/**
 * Register a new hostname for a sub-org. Idempotent against the
 * (hostname) uniqueness constraint — re-creating the same hostname
 * returns the existing row instead of erroring.
 */
export async function createCustomDomain(
  args: { subOrgId: string; hostname: string },
  deps: DomainManagerDeps = {},
): Promise<CreateCustomDomainResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const validation = validateHostname(args.hostname);
  if (!validation.ok) {
    return { ok: false, error: validation.reason, code: "invalid_hostname" };
  }
  const hostname = validation.hostname;

  // Verify the sub-org exists before we touch Vercel.
  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: args.subOrgId },
    select: { id: true },
  });
  if (!subOrg) {
    return { ok: false, error: "Sub-org not found", code: "sub_org_not_found" };
  }

  // Don't double-register: if a row for this hostname already exists,
  // return it instead of asking Vercel again. The caller can re-verify.
  const existing = await prisma.customDomain.findUnique({
    where: { hostname },
  });
  if (existing) {
    if (existing.subOrgId !== args.subOrgId) {
      return {
        ok: false,
        error: "Hostname is already attached to another sub-org",
        code: "hostname_taken",
      };
    }
    return { ok: true, domain: existing, verification: null };
  }

  const vercel = deps.vercel ?? vercelDomainClientFromEnv();
  const vercelResult = await vercel.addDomain(hostname);
  if (!vercelResult.ok) {
    return { ok: false, error: vercelResult.error, code: vercelResult.code };
  }

  const record = vercelResult.data;
  const status: CustomDomainStatus = mapVerifiedToStatus(record.verified);
  // Verification array, when present, carries the TXT challenge the
  // user must add. Store its primary `value` so the UI can show it.
  const verificationToken =
    record.verification?.[0]?.value ?? null;

  const created = await prisma.customDomain.create({
    data: {
      subOrgId: args.subOrgId,
      hostname,
      status,
      verificationToken,
      vercelDomainId: record.id ?? null,
    },
  });
  return {
    ok: true,
    domain: created,
    verification: record.verification ?? null,
  };
}

/**
 * Re-check verification + SSL status. Sync the result into our row.
 * Returns the freshly-updated row so the caller (UI) can re-render.
 */
export async function verifyDomain(
  args: { domainId: string },
  deps: DomainManagerDeps = {},
): Promise<VerifyDomainResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const existing = await prisma.customDomain.findUnique({
    where: { id: args.domainId },
  });
  if (!existing) {
    return { ok: false, error: "Domain not found", code: "domain_not_found" };
  }

  const vercel = deps.vercel ?? vercelDomainClientFromEnv();
  const result = await vercel.verifyDomain(existing.hostname);
  if (!result.ok) {
    // Mark as FAILED so the UI surfaces the problem; user can retry.
    await prisma.customDomain.update({
      where: { id: existing.id },
      data: { status: "FAILED" },
    });
    return { ok: false, error: result.error, code: result.code };
  }

  const status: CustomDomainStatus = mapVerifiedToStatus(result.data.verified);
  const updated = await prisma.customDomain.update({
    where: { id: existing.id },
    data: {
      status,
      sslStatus: result.data.verified ? "ISSUED" : existing.sslStatus,
      sslIssuedAt:
        result.data.verified && !existing.sslIssuedAt ? new Date() : existing.sslIssuedAt,
      verificationToken:
        result.data.verification?.[0]?.value ?? existing.verificationToken,
    },
  });
  return { ok: true, domain: updated };
}

/**
 * Detach a domain from both Vercel and our DB. Vercel-side 404 (already
 * removed) is treated as success — we still tear down the DB row so the
 * sub-org can re-register the same hostname later.
 */
export async function removeCustomDomain(
  args: { domainId: string },
  deps: DomainManagerDeps = {},
): Promise<RemoveDomainResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const existing = await prisma.customDomain.findUnique({
    where: { id: args.domainId },
  });
  if (!existing) {
    return { ok: false, error: "Domain not found", code: "domain_not_found" };
  }

  const vercel = deps.vercel ?? vercelDomainClientFromEnv();
  const result = await vercel.removeDomain(existing.hostname);
  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  await prisma.customDomain.delete({ where: { id: existing.id } });
  return { ok: true };
}

/**
 * Read-only listing for the settings page. Doesn't touch Vercel — the
 * UI polls verify() separately if it needs fresh status.
 */
export async function listDomainsForSubOrg(
  args: { subOrgId: string },
  deps: DomainManagerDeps = {},
): Promise<CustomDomain[]> {
  const prisma = deps.prisma ?? defaultPrisma;
  return prisma.customDomain.findMany({
    where: { subOrgId: args.subOrgId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Hostname → SubOrgId resolution used by middleware. Returns null when
 * the hostname isn't registered. Callers cache this result.
 */
export async function resolveSubOrgIdForHostname(
  hostname: string,
  deps: DomainManagerDeps = {},
): Promise<{ subOrgId: string; status: CustomDomainStatus } | null> {
  const prisma = deps.prisma ?? defaultPrisma;
  const lower = hostname.toLowerCase();
  const row = await prisma.customDomain.findUnique({
    where: { hostname: lower },
    select: { subOrgId: true, status: true },
  });
  if (!row) return null;
  return { subOrgId: row.subOrgId, status: row.status };
}
