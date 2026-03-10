import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Öffentliche Routen (kein Auth nötig)
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
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    // API-Routes: 401 JSON statt HTML-Redirect
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const { userId } = await auth();
      if (!userId) {
        return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
      }
    } else {
      await auth.protect();
    }
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
