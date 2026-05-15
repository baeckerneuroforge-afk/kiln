/**
 * Sprint 19.8 — internal hostname → sub-org resolver for the edge
 * middleware.
 *
 * Why not just call Prisma from middleware: bundling Prisma into the
 * edge function blew past the 1 MB plan limit on Vercel (Sprint 19.8
 * deploy attempt #1). Splitting the DB lookup behind a thin Node-runtime
 * API route keeps the middleware bundle small and lets us reuse the
 * existing Prisma + manager modules without rewriting them.
 *
 * Auth: this endpoint is intentionally public. It returns only a
 * sub-org id + CustomDomain status, which are not secrets — the same
 * information leaks publicly via DNS (the hostname is observable) and
 * via the rendered page itself. We rate-limit by accepting only
 * well-formed hostname strings and by relying on Vercel's platform
 * DDoS protection.
 *
 * Response shape:
 *   { found: false }            — hostname is not registered
 *   { found: true, subOrgId, status }
 */
import { resolveSubOrgIdForHostname } from "@/lib/domains/domain-manager";
import { resolveAgencyOrgIdForHostname } from "@/lib/domains/agency-domain-manager";

export const dynamic = "force-dynamic";

const HOSTNAME_REGEX = /^[a-z0-9.-]{3,253}$/i;

/**
 * Sprint 19.8.1 — extended response shape.
 *
 * Three terminal states the middleware acts on:
 *   { found: false }
 *   { found: true, type: "sub-org",  subOrgId,    status }
 *   { found: true, type: "agency",   agencyOrgId, status }
 *
 * Precedence: a CustomDomain row wins over an AgencyDomain row on the
 * same hostname — the sub-org's premium override pattern.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hostname = searchParams.get("hostname");
  if (!hostname || !HOSTNAME_REGEX.test(hostname)) {
    return Response.json({ found: false }, { status: 200 });
  }
  try {
    const sub = await resolveSubOrgIdForHostname(hostname);
    if (sub) {
      return Response.json(
        {
          found: true,
          type: "sub-org" as const,
          subOrgId: sub.subOrgId,
          status: sub.status,
        },
        { status: 200 },
      );
    }
    const agency = await resolveAgencyOrgIdForHostname(hostname);
    if (agency) {
      return Response.json(
        {
          found: true,
          type: "agency" as const,
          agencyOrgId: agency.agencyOrgId,
          status: agency.status,
        },
        { status: 200 },
      );
    }
    return Response.json({ found: false }, { status: 200 });
  } catch (err) {
    console.error("[resolve-hostname] DB lookup failed:", err);
    // Fail soft so middleware falls back to the legacy /a/_custom-domain
    // route instead of returning 500.
    return Response.json({ found: false }, { status: 200 });
  }
}
