import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Verteiltes Rate-Limiting für teure Endpoints (LLM-Aufrufe etc.).
 *
 * Nutzt Upstash Redis (Sliding-Window), wenn UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN gesetzt sind (funktioniert dann korrekt über
 * mehrere Vercel-Instanzen hinweg). Ist Upstash nicht konfiguriert (z.B.
 * lokal), fällt der Helper auf einen In-Memory-FIXED-Window pro Instanz zurück
 * — wie das bestehende Muster in agents/[id]/chat. So bleibt der Code überall
 * lauffähig und wird in Produktion automatisch verteilt, sobald die Env-Vars
 * vorhanden sind.
 *
 * WICHTIG (Ops): In Produktion MÜSSEN die UPSTASH_*-Vars gesetzt sein. Der
 * Fixed-Window-Fallback erlaubt an der Fenstergrenze kurzzeitig bis ~2× das
 * Limit und gilt nur pro Instanz — also kein echter verteilter Schutz.
 *
 * Hinweis: Der ältere synchrone checkRateLimit() in rate-limit.ts (v1-API)
 * bleibt unverändert; diese Datei ist die async/Redis-fähige Variante für
 * Clerk-authentifizierte, teure Endpoints (Keying typischerweise per userId).
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

let redisClient: Redis | null = null;
let redisChecked = false;

function getRedis(): Redis | null {
  if (redisChecked) return redisClient;
  redisChecked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

const limiterCache = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${limit}:${windowSeconds}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: "kiln:rl",
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

// --- In-Memory-Fallback (pro Instanz) ---
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Gelegentliches Aufräumen abgelaufener Einträge (kein Dauer-Interval).
  if (memoryStore.size > 5000) {
    for (const [k, v] of memoryStore) {
      if (v.resetAt <= now) memoryStore.delete(k);
    }
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetMs: now + windowMs };
  }
  entry.count += 1;
  return {
    ok: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetMs: entry.resetAt,
  };
}

/**
 * Prüft das Rate-Limit für `key` (z.B. "agent-run:<userId>").
 *
 * @param opts.limit          erlaubte Requests pro Fenster
 * @param opts.windowSeconds  Fensterlänge in Sekunden
 */
export async function rateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const limiter = getLimiter(opts.limit, opts.windowSeconds);
  if (!limiter) return memoryLimit(key, opts.limit, opts.windowSeconds);
  try {
    const res = await limiter.limit(key);
    return { ok: res.success, remaining: res.remaining, resetMs: res.reset };
  } catch {
    // Redis-Ausfall → auf In-Memory zurückfallen statt legitimen Traffic zu blocken.
    return memoryLimit(key, opts.limit, opts.windowSeconds);
  }
}

/**
 * Baut eine fertige 429-Response mit Retry-After-Header aus einem
 * RateLimitResult.
 */
export function rateLimitedResponse(result: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((result.resetMs - Date.now()) / 1000));
  return Response.json(
    { error: "Rate limit exceeded. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
