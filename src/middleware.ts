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
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
