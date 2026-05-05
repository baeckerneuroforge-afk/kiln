/**
 * POST   /api/agency/branding/domain — register a custom domain.
 * DELETE /api/agency/branding/domain — release the domain.
 *
 * Both operations are agency-tier only (canManageSubOrgs gate). The
 * Vercel side (addDomain / removeDomain) and the local DB are kept in
 * sync — if Vercel rejects, we don't write the row; if the DB write
 * fails after Vercel succeeds, the cleanup path removes the Vercel
 * registration so the operator can retry.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { addDomain, removeDomain } from "@/lib/vercel/domains";

export const dynamic = "force-dynamic";

const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,63}$/;

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return unauthorized();
  if (!orgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }
  if (!(await canManageSubOrgs(userId, orgId))) {
    return Response.json(
      { error: "Custom domains require AGENCY tier or higher." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { domain?: unknown };
  const raw = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
  if (!raw) {
    return Response.json({ error: "domain is required" }, { status: 400 });
  }
  if (!DOMAIN_RE.test(raw)) {
    return Response.json(
      { error: "domain must look like example.com or sub.example.com" },
      { status: 400 }
    );
  }

  // Conflict check before hitting Vercel — the orgBranding.customDomain
  // column is UNIQUE so the DB would also reject, but a friendly 409
  // beats a generic Prisma error.
  const conflict = await prisma.orgBranding.findFirst({
    where: { customDomain: raw, NOT: { orgId } },
  });
  if (conflict) {
    return Response.json(
      { error: "Domain is already in use by another organization." },
      { status: 409 }
    );
  }

  // Register with Vercel first. If this fails, we never touched the DB.
  let vercelResult;
  try {
    vercelResult = await addDomain(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vercel API error";
    return Response.json({ error: msg }, { status: 502 });
  }

  // Persist (or update) the agency's branding row. Verified flag stays
  // false until status polling confirms DNS + SSL.
  try {
    const saved = await prisma.orgBranding.upsert({
      where: { orgId },
      update: {
        customDomain: raw,
        domainVerified: vercelResult.verified,
        domainVerifiedAt: vercelResult.verified ? new Date() : null,
      },
      create: {
        orgId,
        customDomain: raw,
        domainVerified: vercelResult.verified,
        domainVerifiedAt: vercelResult.verified ? new Date() : null,
      },
    });
    return Response.json({
      domain: saved.customDomain,
      verified: saved.domainVerified,
      verification: vercelResult.verification,
    });
  } catch (err) {
    // Compensate the Vercel side so the operator can retry without
    // hitting "domain already in use" on a phantom registration.
    await removeDomain(raw).catch(() => {});
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  const { userId, orgId } = await auth();
  if (!userId) return unauthorized();
  if (!orgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }
  if (!(await canManageSubOrgs(userId, orgId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const branding = await prisma.orgBranding.findUnique({
    where: { orgId },
    select: { customDomain: true },
  });
  if (!branding?.customDomain) {
    return Response.json({ ok: true, removed: null });
  }

  await removeDomain(branding.customDomain).catch((err) => {
    // Continue with the DB clear even if Vercel says "already gone" —
    // the local-state-of-truth wins from the operator's perspective.
    console.warn("[domain DELETE] Vercel removeDomain failed:", err);
  });

  await prisma.orgBranding.update({
    where: { orgId },
    data: {
      customDomain: null,
      domainVerified: false,
      domainVerifiedAt: null,
    },
  });

  return Response.json({ ok: true, removed: branding.customDomain });
}
