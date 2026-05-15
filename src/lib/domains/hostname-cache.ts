/**
 * Sprint 19.8 — Hostname → SubOrgId lookup cache for middleware.
 *
 * Middleware runs on every request and can't afford a DB round-trip
 * for every page-load on a custom-domain. We cache resolved mappings
 * (and explicit misses, to avoid hot-looping on a typo) in-memory
 * with a short TTL.
 *
 * Vercel's Fluid Compute reuses Function instances across requests,
 * so this cache survives long enough to be useful between hits on
 * the same instance. Cold starts repopulate from the DB.
 *
 * TTL is 5 minutes — short enough that domain edits (verify / delete)
 * propagate quickly, long enough that millions of requests on a
 * stable domain don't hammer the DB.
 *
 * No external state, no Edge Config. If/when traffic outgrows this,
 * migrate to Vercel Edge Config in a follow-up sprint.
 */

/**
 * Sprint 19.8.1 — extended to carry agency-domain matches too. The
 * middleware decides routing based on `type`:
 *   - "sub-org": rewrite to /dashboard/sub-org/[subOrgId]/...
 *   - "agency":  rewrite to /a/_agency-entry (smart-routing page)
 *   - null:      hostname is registered but neither (shouldn't happen
 *                in practice) — fall through to legacy resolver
 */
export interface CachedHostname {
  /** Sprint 19.8 — sub-org id when type==="sub-org". null otherwise. */
  subOrgId: string | null;
  /** Sprint 19.8.1 — agency Clerk-org id when type==="agency". null otherwise. */
  agencyOrgId: string | null;
  /** Match type. null means cache-miss-as-not-found (negative cache). */
  type: "sub-org" | "agency" | null;
  /** Domain status — middleware uses this to refuse routing for non-ACTIVE domains. */
  status: string | null;
  /** Epoch ms when this entry expires. */
  expiresAt: number;
}

export interface HostnameCache {
  get(hostname: string): CachedHostname | null;
  set(hostname: string, value: Omit<CachedHostname, "expiresAt">): void;
  delete(hostname: string): void;
  clear(): void;
  size(): number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 1024;

/**
 * Create a fresh cache. Most callers use the module-level singleton;
 * tests can spin up their own instance to avoid cross-test bleed.
 */
export function createHostnameCache(options?: {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}): HostnameCache {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options?.maxEntries ?? MAX_ENTRIES;
  const now = options?.now ?? Date.now;
  const map = new Map<string, CachedHostname>();

  function pruneIfFull() {
    if (map.size <= maxEntries) return;
    // Drop the oldest insertion. Map iteration order is insertion order
    // in V8, so the first key is the oldest.
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }

  return {
    get(hostname) {
      const entry = map.get(hostname.toLowerCase());
      if (!entry) return null;
      if (entry.expiresAt < now()) {
        map.delete(hostname.toLowerCase());
        return null;
      }
      return entry;
    },
    set(hostname, value) {
      const key = hostname.toLowerCase();
      // Refresh insertion order so frequently-set entries stay live.
      map.delete(key);
      map.set(key, { ...value, expiresAt: now() + ttlMs });
      pruneIfFull();
    },
    delete(hostname) {
      map.delete(hostname.toLowerCase());
    },
    clear() {
      map.clear();
    },
    size() {
      return map.size;
    },
  };
}

// Module-level singleton used by the middleware. Tests should not import
// this — they should create their own cache and inject it where needed.
let singleton: HostnameCache | null = null;
export function getDefaultHostnameCache(): HostnameCache {
  if (!singleton) singleton = createHostnameCache();
  return singleton;
}

/** Test-only: reset the singleton so vitest's isolation works. */
export function __resetDefaultHostnameCacheForTests(): void {
  singleton = null;
}
