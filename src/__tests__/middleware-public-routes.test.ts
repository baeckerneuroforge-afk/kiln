/**
 * Sprint 19.7.7 — public-route matcher coverage for /api/webhooks/clerk.
 *
 * The middleware blocked Clerk's webhook deliveries with 401 between
 * ~9. Mai and 14. Mai because `/api/webhooks/clerk` (plural) was never
 * listed in `isPublicRoute`. Clerk auto-disabled the endpoint after
 * 92.9% failure rate.
 *
 * This test guards that regression with two assertions:
 *   1. The exact public path the route handler lives at is matched.
 *   2. Non-public protected paths still NOT matched (no accidental
 *      wildcard creep). We sample three to keep the test stable as the
 *      app grows new dashboard routes.
 *
 * createRouteMatcher is the same helper the middleware uses, so we
 * exercise the real matcher with the same input list.
 */
import { describe, expect, it } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTE_PATTERNS } from "@/middleware";

/**
 * Clerk's createRouteMatcher reads `nextUrl.pathname` off a NextRequest.
 * We don't need a real one — a minimal object with that shape suffices.
 * Cast through unknown so we don't pull in Next's runtime types just for
 * a test fixture.
 */
function buildRequest(pathname: string) {
  return { nextUrl: { pathname } } as unknown as Request;
}

describe("middleware public routes", () => {
  const isPublic = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);

  it("includes /api/webhooks/clerk so Clerk svix deliveries reach the handler", () => {
    expect(PUBLIC_ROUTE_PATTERNS).toContain("/api/webhooks/clerk");
    expect(isPublic(buildRequest("/api/webhooks/clerk"))).toBe(true);
  });

  it("keeps the existing sibling webhook endpoints public", () => {
    // Each of these has its own signing-secret auth in the handler; they
    // must stay public so the middleware doesn't 401 the upstream service.
    expect(isPublic(buildRequest("/api/webhooks/stripe"))).toBe(true);
    expect(isPublic(buildRequest("/api/webhooks/telegram/abc"))).toBe(true);
    expect(isPublic(buildRequest("/api/webhooks/email/agent123"))).toBe(true);
    expect(isPublic(buildRequest("/api/webhooks/department-email/dep1"))).toBe(
      true,
    );
  });

  it("does NOT make unrelated /api/webhooks/* routes public via wildcard", () => {
    // Sprint 19.7.7 explicitly chose path-by-path public routes over a
    // /api/webhooks/(.*) wildcard. If someone later adds `/api/webhooks/admin`
    // it must NOT bypass auth without an explicit entry.
    expect(isPublic(buildRequest("/api/webhooks/admin"))).toBe(false);
    expect(isPublic(buildRequest("/api/webhooks/unknown"))).toBe(false);
  });

  it("still protects /dashboard/* routes", () => {
    expect(isPublic(buildRequest("/dashboard"))).toBe(false);
    expect(isPublic(buildRequest("/dashboard/agency/team"))).toBe(false);
    expect(isPublic(buildRequest("/dashboard/sub-org/rel_1"))).toBe(false);
  });

  it("still protects authenticated /api/* routes", () => {
    expect(isPublic(buildRequest("/api/agency/team"))).toBe(false);
    expect(isPublic(buildRequest("/api/agency/sub-orgs/rel_1/invite"))).toBe(
      false,
    );
    expect(isPublic(buildRequest("/api/sub-orgs/rel_1/onboarding"))).toBe(false);
  });
});
