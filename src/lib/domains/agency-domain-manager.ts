/**
 * Sprint 19.8.1 — Agency-level custom-domain orchestrator.
 *
 * Sister module to domain-manager.ts (Sprint 19.8). Where that one
 * registers hostnames for individual sub-orgs, this one registers
 * hostnames for *agency* Clerk orgs — the whitelabel entry point
 * that all of an agency's sub-orgs share.
 *
 * Cross-table uniqueness: a hostname can live in EITHER CustomDomain
 * OR AgencyDomain, never both. The validator checks both tables
 * before creating; the API surface returns `hostname_taken` regardless
 * of which table holds it.
 *
 * Single-domain invariant: agency owner can register at most one
 * AgencyDomain (isPrimary=true). Future sprints may relax this; the
 * code path is structured so adding additional rows is mostly an API
 * + UI change, not a model change.
 *
 * All public functions return `{ ok: true, ... }` or `{ ok: false,
 * error, code? }` for ergonomic if-not-ok early-return at call sites.
 */
import type {
  AgencyDomain,
  AgencyDomainStatus,
  PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  type VercelDomainClient,
  type VercelDomainRecord,
  vercelDomainClientFromEnv,
} from "./vercel-domain-client";
import { validateHostname } from "./hostname";

export interface AgencyDomainManagerDeps {
  prisma?: Pick<PrismaClient, "agencyDomain" | "customDomain">;
  vercel?: VercelDomainClient;
}

export type CreateAgencyDomainResult =
  | {
      ok: true;
      domain: AgencyDomain;
      verification: VercelDomainRecord["verification"] | null;
    }
  | { ok: false; error: string; code?: string };

export type VerifyAgencyDomainResult =
  | { ok: true; domain: AgencyDomain }
  | { ok: false; error: string; code?: string };

export type RemoveAgencyDomainResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function mapVerifiedToStatus(
  verified: boolean | undefined,
): AgencyDomainStatus {
  return verified ? "ACTIVE" : "VERIFYING";
}

/**
 * Cross-table hostname uniqueness check. A hostname can live in
 * EITHER CustomDomain OR AgencyDomain, never both — Vercel domains
 * are project-global. Returns the conflict type so the API can
 * surface a precise error message.
 */
export async function findHostnameOwner(
  hostname: string,
  prisma: Pick<PrismaClient, "agencyDomain" | "customDomain"> = defaultPrisma,
): Promise<
  | { kind: "free" }
  | { kind: "sub-org"; subOrgId: string }
  | { kind: "agency"; agencyOrgId: string }
> {
  const lower = hostname.toLowerCase();
  const [sub, agency] = await Promise.all([
    prisma.customDomain.findUnique({
      where: { hostname: lower },
      select: { subOrgId: true },
    }),
    prisma.agencyDomain.findUnique({
      where: { hostname: lower },
      select: { agencyOrgId: true },
    }),
  ]);
  if (sub) return { kind: "sub-org", subOrgId: sub.subOrgId };
  if (agency) return { kind: "agency", agencyOrgId: agency.agencyOrgId };
  return { kind: "free" };
}

/**
 * Register a new agency-level hostname. Enforces:
 *   1. Hostname is syntactically valid (validator)
 *   2. No existing CustomDomain or AgencyDomain row for it
 *   3. This agency doesn't already have an AgencyDomain (single-row
 *      invariant for the current sprint)
 *
 * On success, calls Vercel's addDomain and persists the row with the
 * resulting status / verification token / Vercel id.
 */
export async function createAgencyDomain(
  args: { agencyOrgId: string; hostname: string },
  deps: AgencyDomainManagerDeps = {},
): Promise<CreateAgencyDomainResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const validation = validateHostname(args.hostname);
  if (!validation.ok) {
    return { ok: false, error: validation.reason, code: "invalid_hostname" };
  }
  const hostname = validation.hostname;

  // Idempotency: re-creating the same hostname on the same agency
  // returns the existing row.
  const existingSelf = await prisma.agencyDomain.findUnique({
    where: { hostname },
  });
  if (existingSelf) {
    if (existingSelf.agencyOrgId !== args.agencyOrgId) {
      return {
        ok: false,
        error: "Hostname is already attached to another agency",
        code: "hostname_taken",
      };
    }
    return { ok: true, domain: existingSelf, verification: null };
  }

  // Cross-table conflict with CustomDomain.
  const owner = await findHostnameOwner(hostname, prisma);
  if (owner.kind === "sub-org") {
    return {
      ok: false,
      error: "Hostname is already attached to a sub-org",
      code: "hostname_taken",
    };
  }
  if (owner.kind === "agency" && owner.agencyOrgId !== args.agencyOrgId) {
    return {
      ok: false,
      error: "Hostname is already attached to another agency",
      code: "hostname_taken",
    };
  }

  // Single-row invariant: an agency can have at most one AgencyDomain
  // in this sprint. If another row already exists for this agency,
  // refuse the second-add so the UI can show the user their existing
  // row instead of silently creating a duplicate.
  const otherForAgency = await prisma.agencyDomain.findFirst({
    where: { agencyOrgId: args.agencyOrgId },
  });
  if (otherForAgency) {
    return {
      ok: false,
      error: "Agency already has a primary domain. Remove it first.",
      code: "agency_domain_exists",
    };
  }

  const vercel = deps.vercel ?? vercelDomainClientFromEnv();
  const vercelResult = await vercel.addDomain(hostname);
  if (!vercelResult.ok) {
    return { ok: false, error: vercelResult.error, code: vercelResult.code };
  }
  const record = vercelResult.data;
  const status = mapVerifiedToStatus(record.verified);
  const verificationToken = record.verification?.[0]?.value ?? null;

  const created = await prisma.agencyDomain.create({
    data: {
      agencyOrgId: args.agencyOrgId,
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

export async function verifyAgencyDomain(
  args: { domainId: string },
  deps: AgencyDomainManagerDeps = {},
): Promise<VerifyAgencyDomainResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const existing = await prisma.agencyDomain.findUnique({
    where: { id: args.domainId },
  });
  if (!existing) {
    return { ok: false, error: "Domain not found", code: "domain_not_found" };
  }

  const vercel = deps.vercel ?? vercelDomainClientFromEnv();
  const result = await vercel.verifyDomain(existing.hostname);
  if (!result.ok) {
    await prisma.agencyDomain.update({
      where: { id: existing.id },
      data: { status: "FAILED" },
    });
    return { ok: false, error: result.error, code: result.code };
  }

  const status = mapVerifiedToStatus(result.data.verified);
  const updated = await prisma.agencyDomain.update({
    where: { id: existing.id },
    data: {
      status,
      sslStatus: result.data.verified ? "ISSUED" : existing.sslStatus,
      sslIssuedAt:
        result.data.verified && !existing.sslIssuedAt
          ? new Date()
          : existing.sslIssuedAt,
      verificationToken:
        result.data.verification?.[0]?.value ?? existing.verificationToken,
    },
  });
  return { ok: true, domain: updated };
}

export async function removeAgencyDomain(
  args: { domainId: string },
  deps: AgencyDomainManagerDeps = {},
): Promise<RemoveAgencyDomainResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const existing = await prisma.agencyDomain.findUnique({
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
  await prisma.agencyDomain.delete({ where: { id: existing.id } });
  return { ok: true };
}

/**
 * Read-only listing for the settings page. Single-row in practice;
 * shape returns an array for forward-compatibility with future
 * multi-domain support.
 */
export async function listAgencyDomains(
  args: { agencyOrgId: string },
  deps: AgencyDomainManagerDeps = {},
): Promise<AgencyDomain[]> {
  const prisma = deps.prisma ?? defaultPrisma;
  return prisma.agencyDomain.findMany({
    where: { agencyOrgId: args.agencyOrgId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Middleware-side hostname → agencyOrgId resolution. Called from the
 * internal resolve-hostname API, never directly from middleware
 * (prisma can't ship in the edge bundle).
 */
export async function resolveAgencyOrgIdForHostname(
  hostname: string,
  deps: AgencyDomainManagerDeps = {},
): Promise<{ agencyOrgId: string; status: AgencyDomainStatus } | null> {
  const prisma = deps.prisma ?? defaultPrisma;
  const row = await prisma.agencyDomain.findUnique({
    where: { hostname: hostname.toLowerCase() },
    select: { agencyOrgId: true, status: true },
  });
  if (!row) return null;
  return { agencyOrgId: row.agencyOrgId, status: row.status };
}
