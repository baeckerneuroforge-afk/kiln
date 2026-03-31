import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

// Public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/",
  "/impressum",
  "/privacy",
  "/terms",
  "/dpa",
  "/services",
  "/help",
  "/enterprise",
  "/sign-in/(.*)",
  "/sign-up/(.*)",
  "/api/webhook/(.*)",
  "/api/webhooks/agent/(.*)", // Inbound agent webhooks (eigene Auth)
  "/api/agents/:id/chat",  // Public Chat API
  "/a/:slug",              // Public Agent Pages
  "/embed/:slug",          // Embed Widget
  "/api/embed/(.*)",       // Embed Script JS
  "/api/waitlist",          // Waitlist Signup
  "/api/webhooks/stripe",   // Stripe Webhooks
  "/api/webhooks/telegram/(.*)", // Telegram Bot Webhooks
  "/api/webhooks/email/(.*)",    // Email Inbound Webhooks
  "/api/webhooks/github/(.*)",   // GitHub Webhook Events
  "/api/webhooks/slack/(.*)",    // Slack Event Subscriptions
  "/api/v1/(.*)",           // Public API (eigene Key-Auth)
  "/api/mcp(.*)",            // MCP Server (eigene Key-Auth)
  "/api/health",             // Health Check
  "/api/test/(.*)",          // Test-Endpoints (temporär)
  "/api/automations/run",   // Cron-Endpoint (eigene Secret-Auth)
  "/api/cron/(.*)",         // Cron-Endpoints (eigene Secret-Auth)
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
  "/developers",             // Developer Docs
  "/docs",               // Public API Documentation
  "/changelog",          // Public Changelog
  "/computer-use",       // Computer Use Landing Page
  "/portal/(.*)",        // Client Portal (Token-basierte Auth)
  "/api/portal/:id",     // Portal API (dual auth: Clerk oder Token)
  "/api/webhooks/stripe-connect", // Stripe Connect Webhooks (eigene Signatur-Auth)
]);

export default clerkMiddleware(async (auth, request) => {
  const hostname = request.headers.get("host") || "";

  // Custom Domain Detection: Unbekannte Domain → Agent-Lookup via /a/_custom-domain
  if (!isAppDomain(hostname) && !request.nextUrl.pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/a/_custom-domain`;
    url.searchParams.set("domain", hostname.split(":")[0].toLowerCase());
    return NextResponse.rewrite(url);
  }

  // Referral-Code aus URL in Cookie speichern
  const refCode = request.nextUrl.searchParams.get("ref");
  let response: NextResponse | undefined;
  if (refCode && /^KILN-[A-Z0-9]{4}$/i.test(refCode)) {
    response = NextResponse.next();
    response.cookies.set("kiln_ref", refCode.toUpperCase(), {
      maxAge: 60 * 60 * 24 * 30, // 30 Tage
      path: "/",
      sameSite: "lax",
    });
  }

  // MCP Server: eigene API-Key-Auth, Clerk überspringen
  if (request.nextUrl.pathname === "/api/mcp" || request.nextUrl.pathname.startsWith("/api/mcp/")) {
    return response;
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

  return response;
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
