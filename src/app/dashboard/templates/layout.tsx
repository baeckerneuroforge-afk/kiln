/**
 * Sprint 19.7.6 — templates.manage permission gate.
 *
 * Templates author and deploy across multiple Sub-Orgs, so they sit
 * with the agency-level admin surface. OWNER + ADMIN both have
 * templates.manage; CONSULTANT/VIEWER don't, and get a 404 here.
 */
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { requireAgencyMode } from "@/lib/org-mode";
import {
  ensureAgencyMembershipFromClerkRole,
  permissionsForAgencyRole,
} from "@/lib/permissions/agency-permissions";

export default async function TemplatesLayout({ children }: { children: React.ReactNode }) {
  await requireAgencyMode();

  const { userId, orgId, orgRole } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/dashboard");

  const membership = await ensureAgencyMembershipFromClerkRole(
    userId,
    orgId,
    orgRole ?? null,
  );
  if (!membership || !permissionsForAgencyRole(membership.role).has("templates.manage")) {
    notFound();
  }

  return <>{children}</>;
}
