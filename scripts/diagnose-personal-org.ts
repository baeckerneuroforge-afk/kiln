/**
 * Diagnose a user's personal-org state — used to investigate the
 * "stuck on onboarding" loop reported after Phase 2.3a.
 *
 * Compares three sources of truth for a single user:
 *   1. DB:    User.personalOrgId
 *   2. Clerk: organization with that id (does it still exist?)
 *   3. Clerk: user's organization memberships (do they actually have one?)
 *
 * Outputs a readable report so the operator can pick a fix path:
 *   A) DB orgId set + Clerk org exists + membership found  → frontend bug
 *   B) DB orgId set + Clerk org exists + membership MISSING → call repair
 *   C) DB orgId set + Clerk org NOT FOUND                  → recreate org
 *   D) DB orgId not set                                    → run backfill
 *
 * Run:
 *   npx tsx scripts/diagnose-personal-org.ts <userId>
 *   # e.g. npx tsx scripts/diagnose-personal-org.ts user_3B27fASqxGP0rwIDsXi6Q26KPaP
 */
import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });

async function diagnose(userId: string) {
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY missing");

  console.log(`\n[diagnose] userId = ${userId}\n`);

  // (1) Local DB.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      personalOrgId: true,
      plan: true,
    },
  });
  if (!user) {
    console.log("DB user: NOT FOUND");
    return;
  }
  console.log("DB user:");
  console.log(`  id            = ${user.id}`);
  console.log(`  email         = ${user.email}`);
  console.log(`  plan          = ${user.plan}`);
  console.log(`  personalOrgId = ${user.personalOrgId ?? "(null)"}`);

  // (2) Clerk memberships.
  const memberships = await clerk.users.getOrganizationMembershipList({ userId });
  console.log(`\nClerk memberships: ${memberships.data.length}`);
  for (const m of memberships.data) {
    console.log(
      `  - ${m.organization.id}  ${m.organization.name}  role=${m.role}`
    );
  }

  // (3) Personal org existence in Clerk.
  let personalOrgInClerk: { id: string; name: string } | null = null;
  if (user.personalOrgId) {
    try {
      const org = await clerk.organizations.getOrganization({
        organizationId: user.personalOrgId,
      });
      personalOrgInClerk = { id: org.id, name: org.name };
      console.log(
        `\nPersonal org in Clerk: ${org.id}  ${org.name}  (members=${org.membersCount})`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\nPersonal org in Clerk: NOT FOUND (${msg})`);
    }
  }

  // (4) Verdict.
  const hasMembershipForPersonal = memberships.data.some(
    (m) => m.organization.id === user.personalOrgId
  );

  console.log("\n— verdict —");
  if (!user.personalOrgId) {
    console.log("D) DB has no personalOrgId. Run scripts/backfill-personal-orgs.ts");
  } else if (!personalOrgInClerk) {
    console.log(
      "C) personalOrgId is set in DB but Clerk org is missing. Org needs to be re-created and User.personalOrgId updated."
    );
  } else if (!hasMembershipForPersonal) {
    console.log(
      `B) Org exists in Clerk but the user is NOT a member of it. Repair needed: createOrganizationMembership(orgId=${user.personalOrgId}, userId=${userId}, role=org:admin).`
    );
  } else if (memberships.data.length > 0) {
    console.log(
      "A) DB and Clerk agree — user has memberships. The redirect loop is a frontend bug in src/components/org-required.tsx (likely useOrganizationList not loading the count promptly)."
    );
  } else {
    console.log(
      "?) Inconsistent state — no membership detected even though personal org exists. Same as B, repair the membership."
    );
  }
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: npx tsx scripts/diagnose-personal-org.ts <userId>");
    process.exit(1);
  }
  await diagnose(userId);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
