#!/usr/bin/env tsx
/**
 * Sprint 19.7.1 — backfill existing OrgRelationship rows so they can
 * participate in the new sub-org auth foundation.
 *
 * For each OrgRelationship:
 *   1. Ensure the Clerk child org has publicMetadata.kiln_type="sub_org"
 *      + parentAgencyOrgId — set/patched in place (idempotent).
 *   2. Ensure a SubOrgMembership row exists for the agency user who
 *      originally created the sub-org (OrgRelationship.createdBy), with
 *      role=OWNER + permissionSet=FULL_ACCESS.
 *
 * The Clerk child org already exists (childOrgId), so we never create
 * organizations — only update metadata.
 *
 * Usage:
 *   tsx scripts/migrate-existing-sub-orgs-to-clerk-orgs.ts --dry-run
 *   tsx scripts/migrate-existing-sub-orgs-to-clerk-orgs.ts --live
 *   tsx scripts/migrate-existing-sub-orgs-to-clerk-orgs.ts --live --sub-orgs=cln_a,cln_b
 *
 * The script is idempotent and isolates per-row failures via try/catch
 * so one bad sub-org doesn't block the rest.
 */
import type { OrgRelationship } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  KILN_TYPE_SUB_ORG,
  subOrgMetadata,
} from "@/lib/sub-org/provision";

interface CliOptions {
  dryRun: boolean;
  subOrgIds: string[] | null;
}

interface MigrationResult {
  subOrgId: string;
  childOrgId: string;
  parentOrgId: string;
  action: "ready" | "updated" | "skipped" | "failed";
  reasons: string[];
  error?: string;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args.set(key, value ?? "true");
  }
  const dryRun = args.has("dry-run");
  const live = args.has("live");
  if (!dryRun && !live) {
    throw new Error(
      "Pass either --dry-run or --live. Refusing to guess intent.",
    );
  }
  if (dryRun && live) {
    throw new Error("--dry-run and --live are mutually exclusive.");
  }
  const subOrgsArg = args.get("sub-orgs");
  const subOrgIds = subOrgsArg
    ? subOrgsArg.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  return { dryRun, subOrgIds };
}

export async function findSubOrgsToBackfill(
  restrictTo: string[] | null,
): Promise<OrgRelationship[]> {
  return prisma.orgRelationship.findMany({
    where: restrictTo ? { id: { in: restrictTo } } : undefined,
    orderBy: { createdAt: "asc" },
  });
}

export interface BackfillSubOrgArgs {
  relationship: OrgRelationship;
  dryRun: boolean;
}

/**
 * Pure-ish — accepts a clerk-client factory so tests can inject a mock.
 */
export async function backfillSubOrg(
  args: BackfillSubOrgArgs,
  deps?: {
    clerk?: typeof clerkClient;
    prismaClient?: typeof prisma;
  },
): Promise<MigrationResult> {
  const rel = args.relationship;
  const result: MigrationResult = {
    subOrgId: rel.id,
    childOrgId: rel.childOrgId,
    parentOrgId: rel.parentOrgId,
    action: "ready",
    reasons: [],
  };

  const clerkFactory = deps?.clerk ?? clerkClient;
  const db = deps?.prismaClient ?? prisma;

  try {
    const client = await clerkFactory();
    const org = await client.organizations.getOrganization({
      organizationId: rel.childOrgId,
    });
    const meta = (org.publicMetadata ?? {}) as Record<string, unknown>;
    const needsMetadata =
      meta.kiln_type !== KILN_TYPE_SUB_ORG ||
      meta.parentAgencyOrgId !== rel.parentOrgId;

    if (needsMetadata) {
      result.reasons.push("clerk-metadata-set");
      if (!args.dryRun) {
        await client.organizations.updateOrganization(rel.childOrgId, {
          publicMetadata: {
            ...meta,
            ...subOrgMetadata(rel.parentOrgId),
          },
        });
      }
    }

    const existingOwner = await db.subOrgMembership.findUnique({
      where: {
        subOrgId_userId: { subOrgId: rel.id, userId: rel.createdBy },
      },
    });

    if (!existingOwner) {
      result.reasons.push("owner-membership-created");
      if (!args.dryRun) {
        await db.subOrgMembership.create({
          data: {
            subOrgId: rel.id,
            userId: rel.createdBy,
            role: "OWNER",
            permissionSet: "FULL_ACCESS",
            acceptedAt: rel.createdAt,
          },
        });
      }
    } else if (existingOwner.role !== "OWNER" || existingOwner.permissionSet !== "FULL_ACCESS") {
      result.reasons.push("owner-membership-upgraded");
      if (!args.dryRun) {
        await db.subOrgMembership.update({
          where: { id: existingOwner.id },
          data: { role: "OWNER", permissionSet: "FULL_ACCESS" },
        });
      }
    }

    if (result.reasons.length === 0) {
      result.action = "skipped";
      result.reasons.push("already-current");
    } else {
      result.action = args.dryRun ? "ready" : "updated";
    }
  } catch (err) {
    result.action = "failed";
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

export async function runMigration(options: CliOptions): Promise<MigrationResult[]> {
  const rows = await findSubOrgsToBackfill(options.subOrgIds);
  const results: MigrationResult[] = [];
  for (const rel of rows) {
    const res = await backfillSubOrg({ relationship: rel, dryRun: options.dryRun });
    results.push(res);
  }
  return results;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  console.log(
    `[migrate-sub-orgs] dryRun=${options.dryRun}${options.subOrgIds ? ` subOrgs=${options.subOrgIds.join(",")}` : ""}`,
  );
  const results = await runMigration(options);
  const summary: Record<MigrationResult["action"], number> = {
    ready: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  for (const r of results) {
    summary[r.action] += 1;
    console.log(
      `  ${r.subOrgId} (clerk=${r.childOrgId}): ${r.action} [${r.reasons.join(", ")}]${r.error ? ` ERROR: ${r.error}` : ""}`,
    );
  }
  console.log(`[migrate-sub-orgs] summary:`, summary);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
