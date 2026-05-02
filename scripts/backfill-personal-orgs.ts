/**
 * Backfill Personal workspace orgs for users that pre-date Phase 2.1.
 *
 * Idempotent. Run after deploying the schema migration:
 *
 *   npx tsx scripts/backfill-personal-orgs.ts
 *
 * What it does, per user without a personalOrgId:
 *   1. Creates a Clerk Organization "<user>'s Workspace" with the user as
 *      admin.
 *   2. Stores the new org id on User.personalOrgId.
 *   3. Sets orgId on every user-owned row whose orgId is still NULL.
 *
 * Re-runnable safely:
 *   - Step 1 is skipped when personalOrgId is already set.
 *   - Step 3 only touches rows where "orgId" IS NULL, so a partial run can be
 *     resumed without rewriting already-mapped data.
 *   - Errors per user don't abort the script — they're logged and the next
 *     user is tried.
 *
 * Required env: DATABASE_URL, CLERK_SECRET_KEY.
 */
import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });

// User-direct tables: a single `userId` column, backfill is straightforward.
const USER_DIRECT_TABLES = [
  "Agent",
  "AgentTeam",
  "Conversation",
  "ApiAccessKey",
  "ApiKey",
  "IntegrationConnection",
  "WebhookEndpoint",
  "AiCreditUsage",
  "TeamExecution",
  "AutoTopUpConfig",
  "ResellerAccount",
  "ClientPortal",
  "ReferralCredit",
  "AuditEvent",
  "ApiDiscovery",
  "WatchLearnSession",
  "AgentWorkspaceFile",
  "WorkflowApproval",
  "AgentPublication",
  "KnowledgeEntity",
  "DataConnection",
  "TeamABTest",
  "QuickUseTask",
  "QuickUseMemory",
  "EmbedToken",
] as const;

// Tables backfilled via JOIN — they don't carry userId directly but reference
// a parent that does. Each entry is the raw SQL UPDATE we execute scoped to a
// single user.
const JOIN_BACKFILLS: Array<{ name: string; sql: (userId: string, orgId: string) => string }> = [
  {
    name: "KnowledgeBase",
    sql: (uid, oid) => `
      UPDATE "KnowledgeBase" kb SET "orgId" = '${oid}'
      FROM "Agent" a WHERE kb."agentId" = a.id AND a."userId" = '${uid}' AND kb."orgId" IS NULL
    `,
  },
  {
    name: "Lead",
    sql: (uid, oid) => `
      UPDATE "Lead" l SET "orgId" = '${oid}'
      FROM "Agent" a WHERE l."agentId" = a.id AND a."userId" = '${uid}' AND l."orgId" IS NULL
    `,
  },
  {
    name: "AgentMemory",
    sql: (uid, oid) => `
      UPDATE "AgentMemory" m SET "orgId" = '${oid}'
      FROM "Agent" a WHERE m."agentId" = a.id AND a."userId" = '${uid}' AND m."orgId" IS NULL
    `,
  },
  {
    name: "VisitorMemory",
    sql: (uid, oid) => `
      UPDATE "VisitorMemory" m SET "orgId" = '${oid}'
      FROM "Agent" a WHERE m."agentId" = a.id AND a."userId" = '${uid}' AND m."orgId" IS NULL
    `,
  },
  {
    name: "AutomationRule",
    sql: (uid, oid) => `
      UPDATE "AutomationRule" ar SET "orgId" = '${oid}'
      FROM "Agent" a WHERE ar."agentId" = a.id AND a."userId" = '${uid}' AND ar."orgId" IS NULL
    `,
  },
  {
    name: "AgentRun",
    sql: (uid, oid) => `
      UPDATE "AgentRun" ar SET "orgId" = '${oid}'
      FROM "Agent" a WHERE ar."agentId" = a.id AND a."userId" = '${uid}' AND ar."orgId" IS NULL
    `,
  },
  {
    name: "AgentOrchestration",
    sql: (uid, oid) => `
      UPDATE "AgentOrchestration" ao SET "orgId" = '${oid}'
      FROM "Agent" a WHERE ao."sourceAgentId" = a.id AND a."userId" = '${uid}' AND ao."orgId" IS NULL
    `,
  },
  {
    name: "AgentChannel",
    sql: (uid, oid) => `
      UPDATE "AgentChannel" ac SET "orgId" = '${oid}'
      FROM "Agent" a WHERE ac."agentId" = a.id AND a."userId" = '${uid}' AND ac."orgId" IS NULL
    `,
  },
  {
    name: "AgentResearchEntry",
    sql: (uid, oid) => `
      UPDATE "AgentResearchEntry" e SET "orgId" = '${oid}'
      FROM "Agent" a WHERE e."agentId" = a.id AND a."userId" = '${uid}' AND e."orgId" IS NULL
    `,
  },
  {
    name: "AgentVersion",
    sql: (uid, oid) => `
      UPDATE "AgentVersion" v SET "orgId" = '${oid}'
      FROM "Agent" a WHERE v."agentId" = a.id AND a."userId" = '${uid}' AND v."orgId" IS NULL
    `,
  },
  {
    name: "AgentAnalytics",
    sql: (uid, oid) => `
      UPDATE "AgentAnalytics" an SET "orgId" = '${oid}'
      FROM "Agent" a WHERE an."agentId" = a.id AND a."userId" = '${uid}' AND an."orgId" IS NULL
    `,
  },
  {
    name: "MCPConnection",
    sql: (uid, oid) => `
      UPDATE "MCPConnection" mc SET "orgId" = '${oid}'
      FROM "Agent" a WHERE mc."agentId" = a.id AND a."userId" = '${uid}' AND mc."orgId" IS NULL
    `,
  },
  {
    name: "ROIConfig",
    sql: (uid, oid) => `
      UPDATE "ROIConfig" r SET "orgId" = '${oid}'
      FROM "Agent" a WHERE r."agentId" = a.id AND a."userId" = '${uid}' AND r."orgId" IS NULL
    `,
  },
  {
    name: "ModelRoutingConfig",
    sql: (uid, oid) => `
      UPDATE "ModelRoutingConfig" mr SET "orgId" = '${oid}'
      FROM "Agent" a WHERE mr."agentId" = a.id AND a."userId" = '${uid}' AND mr."orgId" IS NULL
    `,
  },
  {
    name: "TeamVersion",
    sql: (uid, oid) => `
      UPDATE "TeamVersion" tv SET "orgId" = '${oid}'
      FROM "AgentTeam" t WHERE tv."teamId" = t.id AND t."userId" = '${uid}' AND tv."orgId" IS NULL
    `,
  },
  {
    name: "ClientSubscription",
    sql: (uid, oid) => `
      UPDATE "ClientSubscription" cs SET "orgId" = '${oid}'
      FROM "ResellerAccount" ra WHERE cs."resellerAccountId" = ra.id AND ra."userId" = '${uid}' AND cs."orgId" IS NULL
    `,
  },
  {
    name: "CollaborationLink",
    sql: (uid, oid) => `
      UPDATE "CollaborationLink" cl SET "orgId" = '${oid}'
      FROM "Agent" a WHERE cl."agentId" = a.id AND a."userId" = '${uid}' AND cl."orgId" IS NULL
    `,
  },
];

function buildOrgName(u: { firstName?: string | null; lastName?: string | null; email: string }): string {
  const first = u.firstName?.trim();
  const last = u.lastName?.trim();
  if (first || last) return `${[first, last].filter(Boolean).join(" ")}'s Workspace`;
  const local = u.email.split("@")[0];
  return `${local}'s Workspace`;
}

async function ensurePersonalOrg(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  personalOrgId: string | null;
}): Promise<string> {
  if (user.personalOrgId) return user.personalOrgId;
  const name = buildOrgName(user);
  const org = await clerk.organizations.createOrganization({
    name,
    createdBy: user.id,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { personalOrgId: org.id },
  });
  return org.id;
}

async function backfillUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  personalOrgId: string | null;
}) {
  const orgId = await ensurePersonalOrg(user);

  // Direct user-owned tables.
  for (const table of USER_DIRECT_TABLES) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "orgId" = $1 WHERE "userId" = $2 AND "orgId" IS NULL`,
      orgId,
      user.id
    );
    if (result > 0) {
      console.log(`  ${table}: ${result} rows`);
    }
  }

  // Tables backfilled via JOIN to a parent that owns userId.
  for (const job of JOIN_BACKFILLS) {
    try {
      const sql = job.sql(user.id, orgId);
      const result = await prisma.$executeRawUnsafe(sql);
      if (result > 0) {
        console.log(`  ${job.name}: ${result} rows (via JOIN)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${job.name}: skipped (${msg})`);
    }
  }
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is required");
  }

  const users = await prisma.user.findMany({
    where: { personalOrgId: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      personalOrgId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${users.length} user(s) without personalOrgId.`);

  let processed = 0;
  let failed = 0;

  for (const user of users) {
    console.log(`\n[${++processed}/${users.length}] ${user.email} (${user.id})`);
    try {
      await backfillUser(user);
    } catch (err) {
      failed += 1;
      console.error(`  failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone. ${processed - failed}/${processed} user(s) backfilled successfully${failed ? `, ${failed} failed` : ""}.`
  );
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
