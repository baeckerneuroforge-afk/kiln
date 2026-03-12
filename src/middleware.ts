import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Bekannte App-Domains (nicht als Custom Domain behandeln)
const APP_DOMAINS = new Set([
  "localhost",
  "kiln-topaz.vercel.app",
  process.env.NEXT_PUBLIC_APP_DOMAIN,
].filter(Boolean).map((d) => d!.toLowerCase()));

function isAppDomain(hostname: string): boolean {
  const clean = hostname.split(":")[0].toLowerCase();
  return APP_DOMAINS.has(clean) || clean.endsWith(".vercel.app") || clean === "localhost";
}

// Public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in/(.*)",
  "/sign-up/(.*)",
  "/api/webhook/(.*)",
  "/api/agents/:id/chat",  // Public Chat API
  "/a/:slug",              // Public Agent Pages
  "/embed/:slug",          // Embed Widget
  "/api/embed/(.*)",       // Embed Script JS
  "/api/waitlist",          // Waitlist Signup
  "/api/webhooks/stripe",   // Stripe Webhooks
  "/api/v1/(.*)",           // Public API (eigene Key-Auth)
  "/api/automations/run",   // Cron-Endpoint (eigene Secret-Auth)
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
