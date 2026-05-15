import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDefaultHostnameCache } from "@/lib/domains/hostname-cache";

// NOTE — do NOT import @/lib/domains/domain-manager (or anything that
// transitively loads `@/lib/prisma`) into this file. Middleware runs on
// the Edge runtime, where the Prisma client bundle blows past the 1 MB
// Function-size limit (Sprint 19.8 deploy attempt #1 fail mode). The
// hostname lookup goes through a thin internal API route instead — see
// `resolveSubOrgRewrite` below.

// Bekannte App-Domains (nicht als Custom Domain behandeln)
const APP_DOMAINS = new Set([
  "localhost",
  "kilnbase.com",
  process.env.NEXT_PUBLIC_APP_DOMAIN,
].filter(Boolean).map((d) => d!.toLowerCase()));

function isAppDomain(hostname: string): boolean {
  const clean = hostname.split(":")[0].toLowerCase();
  return APP_DOMAINS.has(clean) || clean.endsWith(".vercel.app") || clean === "localhost";
}

// Public routes (no auth required). Exported so tests can re-build the
// matcher and assert specific paths are / aren't covered without spinning
// up the whole clerkMiddleware closure. Treat additions like security
// changes — every entry here bypasses Clerk session auth.
export const PUBLIC_ROUTE_PATTERNS: readonly string[] = [
  "/",
  "/impressum",
  "/privacy",
  "/terms",
  "/dpa",
  "/services",
  "/help",
  "/enterprise",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook/(.*)",
  // Sprint 19.7.7 — Clerk org/user webhook endpoint. Svix signature
  // verification gates the handler itself (`CLERK_WEBHOOK_SECRET` +
  // svix-* headers checked at route-handler start), so we don't need
  // Clerk session auth here. Without this exemption, the endpoint
  // returned 401 for every Clerk delivery — Clerk auto-disabled it
  // after 92.9% error rate. Listed explicitly (no wildcard) so a typo
  // in another webhook path can't accidentally bypass session auth.
  "/api/webhooks/clerk",
  // Sprint 19.8 — middleware calls this endpoint to resolve hostname →
  // sub-org-id without bundling Prisma into the edge runtime. Listed
  // here because the call happens before Clerk auth runs.
  "/api/internal/resolve-hostname",
  "/api/webhooks/agent/(.*)", // Inbound agent webhooks (eigene Auth)
  "/api/agents/:id/chat",  // Public Chat API
  "/a/:slug",              // Public Agent Pages
  "/embed/:slug",          // Embed Widget
  "/api/embed/(.*)",       // Embed Script JS
  "/api/waitlist",          // Waitlist Signup
  "/api/webhooks/stripe",   // Stripe Webhooks
  "/api/webhooks/stripe-connect",  // Stripe Connect Webhooks (separate signing secret)
  "/onboarding/:id",         // Sub-Org White-Label Onboarding (Phase 4)
  "/onboarding/:id/success", // Onboarding success page after Stripe Checkout
  "/api/onboarding/:id/checkout", // Public onboarding checkout (cuid as token)
  "/api/webhooks/telegram/(.*)", // Telegram Bot Webhooks
  "/api/webhooks/email/(.*)",    // Email Inbound Webhooks
  "/api/webhooks/department-email(.*)", // Department Email Inbound Webhooks
  "/api/webhooks/department-whatsapp(.*)", // Department WhatsApp Webhooks
  "/api/webhooks/github/(.*)",   // GitHub Webhook Events
  "/api/webhooks/slack/(.*)",    // Slack Event Subscriptions
  "/api/v1/(.*)",           // Public API (eigene Key-Auth)
  "/api/mcp(.*)",            // MCP Server (eigene Key-Auth)
  "/api/health",             // Health Check
  "/api/test/(.*)",          // Test-Endpoints (temporär)
  "/api/automations/run",   // Cron-Endpoint (eigene Secret-Auth)
  "/api/cron/(.*)",         // Cron-Endpoints (eigene Secret-Auth)
  "/api/departments/:id/trigger", // Department inbound webhook (secret auth)
  "/api/agents/:id/knowledge/:kbId/embed", // KB embedding (CRON_SECRET Auth)
  "/api/admin/site-intelligence", // Site Intelligence (dual auth: Clerk oder CRON_SECRET)
  "/api/teams/:id/executions/:execId/approve",
  "/api/teams/:id/executions/:execId/reject",
  "/api/workflows/callback/(.*)",  // Workflow callback (resume paused executions)
  "/api/workflows/form/(.*)",      // Workflow form API
  "/workflows/form/(.*)",          // Workflow form page (public)
  "/marketplace",            // Public Marketplace
  "/a2a/directory",          // Public A2A Agent Directory
  "/api/a2a/(.*)",           // A2A Protocol (eigene Key-Auth)
  "/landing-v2",             // Landing V2 Preview
  "/legacy",                 // Legacy landing-page backup
  "/agencies",               // For-agencies marketing page
  "/features/(.*)",          // Public feature deep-dive pages
  "/developers",             // Developer Docs
  "/docs",               // Public API Documentation
  "/changelog",          // Public Changelog
  "/computer-use",       // Computer Use Landing Page
  "/portal/(.*)",        // Client Portal (Token-basierte Auth)
  "/api/portal/:id",     // Portal API (dual auth: Clerk oder Token)
  "/api/webhooks/stripe-connect", // Stripe Connect Webhooks (eigene Signatur-Auth)
] as const;

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);

export default clerkMiddleware(async (auth, request) => {
  const hostname = request.headers.get("host") || "";

  // Sprint 19.7.6 — forward the pathname to server components so layouts
  // (notably the sub-org onboarding-wizard detector) can know the route
  // they're rendering for without re-parsing the URL.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Custom Domain Detection. Three layers, in priority order:
  //
  //   1. Sprint 19.8 — sub-org custom domains. Hostname registered in
  //      CustomDomain table (status=ACTIVE) is rewritten to
  //      /dashboard/sub-org/[id]/... so the browser URL stays on the
  //      custom domain while the app renders the sub-org workspace.
  //
  //   2. Sprint 19.8.1 — agency-level whitelabel domains. Hostname
  //      registered in AgencyDomain table → rewrite to
  //      /a/_agency-entry which handles smart-routing based on the
  //      caller's sub-org memberships (0 → 403, 1 → direct to
  //      sub-org, many → selector). Pass-through for paths that
  //      already point to a sub-org workspace or to /sign-in so the
  //      redirect chain after smart-routing doesn't loop.
  //
  //   3. Legacy Agent / Agency-Branding custom domains route to
  //      /a/_custom-domain. Kept as the final fallback so existing
  //      single-agent custom-domain users continue to work.
  //
  // Resolution is cached in-memory for 5 min to avoid hitting the
  // internal resolver API on every page-load. Status != ACTIVE falls
  // through so a half-set-up domain doesn't accidentally serve the
  // wrong page.
  if (!isAppDomain(hostname) && !request.nextUrl.pathname.startsWith("/api/")) {
    const cleanHost = hostname.split(":")[0].toLowerCase();
    const match = await resolveHostnameRewrite(cleanHost, request.nextUrl.origin);

    if (match?.type === "sub-org") {
      const url = request.nextUrl.clone();
      const incomingPath =
        request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname;
      url.pathname = `/dashboard/sub-org/${match.id}${incomingPath}`;
      const rewritten = NextResponse.rewrite(url);
      rewritten.headers.set("x-kiln-host", cleanHost);
      rewritten.headers.set("x-custom-domain", cleanHost);
      rewritten.headers.set("x-sub-org-id", match.id);
      rewritten.headers.set("x-pathname", request.nextUrl.pathname);
      return rewritten;
    }

    if (match?.type === "agency") {
      const path = request.nextUrl.pathname;
      // Paths the agency-domain user is allowed to keep traversing
      // without going through the smart-router again. Sub-org admin
      // areas stay reachable; sign-in/up land on Clerk's pages with
      // agency branding context attached.
      const passThrough =
        path.startsWith("/dashboard/sub-org/") ||
        path.startsWith("/sign-in") ||
        path.startsWith("/sign-up") ||
        path.startsWith("/_next") ||
        path.startsWith("/api/");
      if (passThrough) {
        const passResponse = NextResponse.next({
          request: { headers: requestHeaders },
        });
        passResponse.headers.set("x-kiln-host", cleanHost);
        passResponse.headers.set("x-agency-domain", cleanHost);
        passResponse.headers.set("x-agency-org-id", match.id);
        passResponse.headers.set("x-pathname", path);
        // Make these visible to server components via requestHeaders too,
        // otherwise the rewritten /sign-in render can't read them.
        requestHeaders.set("x-agency-domain", cleanHost);
        requestHeaders.set("x-agency-org-id", match.id);
        return passResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = `/a/_agency-entry`;
      url.searchParams.set("intended", path);
      const rewritten = NextResponse.rewrite(url);
      rewritten.headers.set("x-kiln-host", cleanHost);
      rewritten.headers.set("x-agency-domain", cleanHost);
      rewritten.headers.set("x-agency-org-id", match.id);
      rewritten.headers.set("x-pathname", path);
      return rewritten;
    }

    // Fallback for unregistered hostnames — legacy Agent / Agency-Branding
    // resolver decides what to render.
    const url = request.nextUrl.clone();
    url.pathname = `/a/_custom-domain`;
    url.searchParams.set("domain", cleanHost);
    const rewritten = NextResponse.rewrite(url);
    rewritten.headers.set("x-kiln-host", cleanHost);
    rewritten.headers.set("x-pathname", request.nextUrl.pathname);
    return rewritten;
  }

  // Referral-Code aus URL in Cookie speichern
  const refCode = request.nextUrl.searchParams.get("ref");
  let response: NextResponse | undefined;
  if (refCode && /^KILN-[A-Z0-9]{4}$/i.test(refCode)) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set("kiln_ref", refCode.toUpperCase(), {
      maxAge: 60 * 60 * 24 * 30, // 30 Tage
      path: "/",
      sameSite: "lax",
    });
  }

  // MCP Server: eigene API-Key-Auth, Clerk überspringen
  if (request.nextUrl.pathname === "/api/mcp" || request.nextUrl.pathname.startsWith("/api/mcp/")) {
    return response ?? NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!isPublicRoute(request)) {
    // API routes: return 401 JSON instead of HTML redirect
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const { userId } = await auth();
      if (!userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      await auth.protect();
    }
  }

  return response ?? NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

/**
 * Sprint 19.8.1 — resolve a custom hostname to either a sub-org or
 * an agency, with sub-org taking precedence.
 *
 * Returns:
 *   { type: "sub-org", id: <subOrgId> }     if CustomDomain ACTIVE
 *   { type: "agency",  id: <agencyOrgId> }  if AgencyDomain ACTIVE
 *   null                                     otherwise
 *
 * Uses a short-lived in-memory cache to keep the happy path
 * Prisma-free. Cache misses (including registered-but-pending) are
 * also cached so we don't hammer the resolver on every page-load
 * during DNS propagation.
 *
 * The DB lookup itself is delegated to `/api/internal/resolve-hostname`
 * because Prisma can't ship in the edge-middleware bundle (1 MB plan
 * limit, learned the hard way in Sprint 19.8). The fetch adds ~5-15ms
 * on cache miss; happy-path hits return in <1ms straight from memory.
 */
type HostnameRewrite = { type: "sub-org" | "agency"; id: string };

async function resolveHostnameRewrite(
  hostname: string,
  origin: string,
): Promise<HostnameRewrite | null> {
  const cache = getDefaultHostnameCache();
  const cached = cache.get(hostname);
  if (cached) {
    if (cached.status !== "ACTIVE") return null;
    if (cached.type === "sub-org" && cached.subOrgId) {
      return { type: "sub-org", id: cached.subOrgId };
    }
    if (cached.type === "agency" && cached.agencyOrgId) {
      return { type: "agency", id: cached.agencyOrgId };
    }
    return null;
  }

  let resolved:
    | { type: "sub-org"; subOrgId: string; status: string }
    | { type: "agency"; agencyOrgId: string; status: string }
    | null = null;
  try {
    const url = `${origin}/api/internal/resolve-hostname?hostname=${encodeURIComponent(hostname)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as
        | { found: false }
        | {
            found: true;
            type: "sub-org";
            subOrgId: string;
            status: string;
          }
        | {
            found: true;
            type: "agency";
            agencyOrgId: string;
            status: string;
          };
      if (body.found) resolved = body;
    }
  } catch (err) {
    console.warn("[middleware] hostname lookup failed:", err);
    return null;
  }

  cache.set(hostname, {
    subOrgId: resolved?.type === "sub-org" ? resolved.subOrgId : null,
    agencyOrgId: resolved?.type === "agency" ? resolved.agencyOrgId : null,
    type: resolved?.type ?? null,
    status: resolved?.status ?? null,
  });

  if (!resolved || resolved.status !== "ACTIVE") return null;
  if (resolved.type === "sub-org") {
    return { type: "sub-org", id: resolved.subOrgId };
  }
  return { type: "agency", id: resolved.agencyOrgId };
}
