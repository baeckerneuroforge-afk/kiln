/**
 * Test endpoint to verify outbound HTTP works on Vercel.
 * GET /api/test/fetch — fetches asana.com/pricing and reports results.
 * DELETE THIS after confirming it works.
 */

import { safeFetch } from "@/lib/url-validation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const results: Record<string, unknown> = {};
  const targets = [
    "https://asana.com/pricing",
    "https://httpbin.org/get",
  ];

  for (const url of targets) {
    const start = Date.now();
    try {
      const res = await safeFetch(url, {
        headers: { "User-Agent": "KILN-Agent/1.0" },
      });
      const text = await res.text();
      results[url] = {
        ok: true,
        status: res.status,
        bodyLength: text.length,
        ms: Date.now() - start,
        snippet: text.slice(0, 200),
      };
    } catch (err) {
      results[url] = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - start,
      };
    }
  }

  return Response.json({ timestamp: new Date().toISOString(), results });
}
