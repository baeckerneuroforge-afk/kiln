#!/usr/bin/env tsx
/**
 * Sprint 19.7.4.1 — delete Clerk test-orgs that don't belong to the
 * real KILN org graph.
 *
 * Keep rules (anything matching here is NEVER touched):
 *   - The "master" Clerk org identified by name (default
 *     "Hephaistos-Systems", overridable via --master-name=...).
 *     If there are duplicates, the one with the most active
 *     OrgRelationship children wins; ties broken by member count,
 *     then by oldest createdAt.
 *   - Any Clerk org whose id appears as `parentOrgId` of an ACTIVE
 *     OrgRelationship row (a real agency).
 *   - Any Clerk org whose id appears as `childOrgId` of an ACTIVE
 *     OrgRelationship row (a real sub-org).
 *
 * Everything else → DELETE candidate. Before issuing the delete we
 * re-check OrgRelationship one more time and refuse to delete anything
 * still referenced (defence in depth — if a row was created mid-script).
 *
 * Usage:
 *   tsx scripts/cleanup-clerk-test-orgs.ts --dry-run
 *   tsx scripts/cleanup-clerk-test-orgs.ts --live
 *   tsx scripts/cleanup-clerk-test-orgs.ts --dry-run --master-name="My Agency"
 *
 * Exit code:
 *   0 = clean (all planned deletes succeeded, or dry-run)
 *   1 = aborted (referenced org would have been deleted; manual review)
 *   2 = one or more per-org delete calls failed (rest still ran)
 *   3 = bad CLI args or Clerk API unreachable
 */
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

interface CliOptions {
  dryRun: boolean;
  masterName: string;
}

interface ClerkOrgLite {
  id: string;
  name: string;
  membersCount: number;
  createdAt: number; // ms epoch
}

interface ClassifiedOrg extends ClerkOrgLite {
  action:
    | "KEEP_MASTER"
    | "KEEP_AGENCY"
    | "KEEP_SUB_ORG"
    | "DELETE"
    | "DELETE_DUPLICATE_MASTER";
  reason: string;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const map = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    map.set(key, value ?? "true");
  }
  const dryRun = map.has("dry-run");
  const live = map.has("live");
  if (!dryRun && !live) {
    throw new Error("Pass either --dry-run or --live. Refusing to guess intent.");
  }
  if (dryRun && live) {
    throw new Error("--dry-run and --live are mutually exclusive.");
  }
  return {
    dryRun,
    masterName: (map.get("master-name") ?? "Hephaistos-Systems").trim(),
  };
}

function normalizeName(s: string): string {
  return s.replace(/[\s_-]+/g, " ").trim().toLowerCase();
}

export interface ClassifyArgs {
  orgs: ClerkOrgLite[];
  masterName: string;
  /** Clerk org ids that are an ACTIVE OrgRelationship parent. */
  agencyClerkIds: Set<string>;
  /** Clerk org ids that are an ACTIVE OrgRelationship child. */
  subOrgClerkIds: Set<string>;
  /** Map childOrgId → relationshipCount for tie-breaking master candidates. */
  childCountByParent: Map<string, number>;
}

/**
 * Pure-ish classifier — extracted so unit tests don't need a real
 * Clerk client. Picks one master from duplicates, marks
 * sub-org/agency references KEEP, everything else DELETE.
 */
export function classifyOrgs(args: ClassifyArgs): ClassifiedOrg[] {
  const targetMaster = normalizeName(args.masterName);

  const masterCandidates = args.orgs.filter(
    (o) => normalizeName(o.name) === targetMaster,
  );

  let chosenMasterId: string | null = null;
  if (masterCandidates.length > 0) {
    masterCandidates.sort((a, b) => {
      const childrenA = args.childCountByParent.get(a.id) ?? 0;
      const childrenB = args.childCountByParent.get(b.id) ?? 0;
      if (childrenA !== childrenB) return childrenB - childrenA;
      if (a.membersCount !== b.membersCount) return b.membersCount - a.membersCount;
      return a.createdAt - b.createdAt;
    });
    chosenMasterId = masterCandidates[0].id;
  }

  return args.orgs.map((o) => {
    if (o.id === chosenMasterId) {
      return { ...o, action: "KEEP_MASTER", reason: "Master agency org" };
    }
    if (normalizeName(o.name) === targetMaster) {
      return {
        ...o,
        action: "DELETE_DUPLICATE_MASTER",
        reason: "Duplicate of master agency org",
      };
    }
    if (args.subOrgClerkIds.has(o.id)) {
      return { ...o, action: "KEEP_SUB_ORG", reason: "Referenced as childOrgId by an ACTIVE OrgRelationship" };
    }
    if (args.agencyClerkIds.has(o.id)) {
      return { ...o, action: "KEEP_AGENCY", reason: "Referenced as parentOrgId by an ACTIVE OrgRelationship" };
    }
    return { ...o, action: "DELETE", reason: "Not referenced by any OrgRelationship row" };
  });
}

async function listAllClerkOrgs(): Promise<ClerkOrgLite[]> {
  const client = await clerkClient();
  const result: ClerkOrgLite[] = [];
  let offset = 0;
  const LIMIT = 100;
  // Clerk's getOrganizationList returns at most `limit` rows; loop
  // until we get a short page.
  while (true) {
    const page = await client.organizations.getOrganizationList({ limit: LIMIT, offset });
    for (const o of page.data) {
      result.push({
        id: o.id,
        name: o.name,
        membersCount: o.membersCount ?? 0,
        createdAt: o.createdAt ?? Date.now(),
      });
    }
    if (page.data.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 5_000) break; // hard safety
  }
  return result;
}

export interface RunArgs {
  options: CliOptions;
  /** Injectable for tests. */
  fetchOrgs?: () => Promise<ClerkOrgLite[]>;
  /** Injectable for tests. */
  deleteOrg?: (orgId: string) => Promise<void>;
}

export interface RunResult {
  classified: ClassifiedOrg[];
  attempted: number;
  succeeded: number;
  failed: Array<{ orgId: string; error: string }>;
  abortedReferencedDelete: ClassifiedOrg | null;
}

export async function runCleanup(args: RunArgs): Promise<RunResult> {
  const fetchOrgs = args.fetchOrgs ?? listAllClerkOrgs;
  const deleteOrg =
    args.deleteOrg ??
    (async (orgId: string) => {
      const client = await clerkClient();
      await client.organizations.deleteOrganization(orgId);
    });

  const orgs = await fetchOrgs();
  const relationships = await prisma.orgRelationship.findMany({
    where: { subOrgStatus: "ACTIVE" },
    select: { id: true, parentOrgId: true, childOrgId: true },
  });
  const agencyClerkIds = new Set(relationships.map((r) => r.parentOrgId));
  const subOrgClerkIds = new Set(relationships.map((r) => r.childOrgId));
  const childCountByParent = new Map<string, number>();
  for (const r of relationships) {
    childCountByParent.set(r.parentOrgId, (childCountByParent.get(r.parentOrgId) ?? 0) + 1);
  }

  const classified = classifyOrgs({
    orgs,
    masterName: args.options.masterName,
    agencyClerkIds,
    subOrgClerkIds,
    childCountByParent,
  });

  const result: RunResult = {
    classified,
    attempted: 0,
    succeeded: 0,
    failed: [],
    abortedReferencedDelete: null,
  };

  // Defence in depth: re-check before deleting. If anything that maps
  // to DELETE/DELETE_DUPLICATE_MASTER turns out to still be referenced
  // (race / stale classification input), abort the whole cleanup.
  const referencedIds = new Set<string>([...agencyClerkIds, ...subOrgClerkIds]);
  for (const c of classified) {
    if (c.action !== "DELETE" && c.action !== "DELETE_DUPLICATE_MASTER") continue;
    if (referencedIds.has(c.id)) {
      result.abortedReferencedDelete = c;
      return result;
    }
  }

  if (args.options.dryRun) {
    return result;
  }

  for (const c of classified) {
    if (c.action !== "DELETE" && c.action !== "DELETE_DUPLICATE_MASTER") continue;
    result.attempted += 1;
    try {
      await deleteOrg(c.id);
      result.succeeded += 1;
    } catch (err) {
      result.failed.push({
        orgId: c.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

async function main() {
  let options: CliOptions;
  try {
    options = parseCliOptions(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(3);
  }

  console.log(
    `[cleanup-clerk] dryRun=${options.dryRun} master="${options.masterName}"`,
  );

  let result: RunResult;
  try {
    result = await runCleanup({ options });
  } catch (err) {
    console.error("[cleanup-clerk] Clerk API call failed:", err);
    process.exit(3);
  }

  for (const c of result.classified) {
    const ts = new Date(c.createdAt).toISOString();
    console.log(
      `  ${c.id.padEnd(34)} ${c.action.padEnd(24)} members=${String(c.membersCount).padStart(3)} created=${ts}  name="${c.name}"  reason=${c.reason}`,
    );
  }

  if (result.abortedReferencedDelete) {
    const c = result.abortedReferencedDelete;
    console.error(
      `\n[cleanup-clerk] ABORTED — would have deleted ${c.id} (${c.name}) but it's still referenced by an OrgRelationship row. Manual review required.`,
    );
    process.exit(1);
  }

  const summary = result.classified.reduce<Record<string, number>>((acc, c) => {
    acc[c.action] = (acc[c.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\n[cleanup-clerk] summary:", summary);
  console.log(
    `[cleanup-clerk] attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed.length}`,
  );
  for (const f of result.failed) {
    console.log(`  FAIL ${f.orgId}: ${f.error}`);
  }

  if (result.failed.length > 0) process.exit(2);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
