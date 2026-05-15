/**
 * Sprint 19.8 — Thin Vercel Domains API wrapper.
 *
 * Four endpoints used by the sub-org custom-domain feature:
 *   - addDomain        POST   /v9/projects/[id]/domains
 *   - verifyDomain     POST   /v9/projects/[id]/domains/[host]/verify
 *   - getDomainStatus  GET    /v9/projects/[id]/domains/[host]
 *   - removeDomain     DELETE /v9/projects/[id]/domains/[host]
 *
 * `fetch` is injected (default: global fetch) so tests can replay
 * deterministic responses without nock/MSW. All callers receive a
 * discriminated-union result — `{ ok: true, data }` or `{ ok: false,
 * error }` — so we never leak a partial network failure as a thrown
 * exception to the orchestrator above.
 */

const VERCEL_API_BASE = "https://api.vercel.com";

export interface VercelDomainConfig {
  configured: boolean;
  misconfigured: boolean;
  acceptedChallenges?: string[];
  conflicts?: unknown[];
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
}

export interface VercelDomainRecord {
  id?: string;
  name: string;
  verified?: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
  apexName?: string;
  projectId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type VercelDomainResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string };

export interface VercelDomainClientArgs {
  apiToken: string;
  projectId: string;
  teamId?: string | null;
  fetchImpl?: typeof fetch;
}

/**
 * Create a thin client. Stateless — safe to instantiate per request,
 * but in middleware/serverless contexts callers typically reuse one
 * instance per Function invocation.
 */
export function createVercelDomainClient(args: VercelDomainClientArgs) {
  const { apiToken, projectId, teamId, fetchImpl = fetch } = args;

  function buildUrl(path: string): string {
    const url = new URL(`${VERCEL_API_BASE}${path}`);
    if (teamId) url.searchParams.set("teamId", teamId);
    return url.toString();
  }

  async function request<T>(
    path: string,
    init: RequestInit,
  ): Promise<VercelDomainResult<T>> {
    let response: Response;
    try {
      response = await fetchImpl(buildUrl(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : "network_error",
        code: "network_error",
      };
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { rawText: text };
      }
    }
    if (!response.ok) {
      const errObj = (parsed as { error?: { message?: string; code?: string } } | null)?.error;
      return {
        ok: false,
        status: response.status,
        error: errObj?.message ?? `HTTP ${response.status}`,
        code: errObj?.code,
      };
    }
    return { ok: true, data: parsed as T };
  }

  return {
    /**
     * Add a hostname to the Vercel project. Returns the canonical domain
     * record including any `verification` array Vercel wants the user to
     * satisfy via DNS.
     */
    async addDomain(hostname: string): Promise<VercelDomainResult<VercelDomainRecord>> {
      return request<VercelDomainRecord>(`/v10/projects/${projectId}/domains`, {
        method: "POST",
        body: JSON.stringify({ name: hostname }),
      });
    },

    /**
     * Re-trigger verification for a hostname after the user updated DNS.
     * The endpoint is idempotent — repeated calls don't damage state.
     */
    async verifyDomain(
      hostname: string,
    ): Promise<VercelDomainResult<VercelDomainRecord>> {
      return request<VercelDomainRecord>(
        `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}/verify`,
        { method: "POST" },
      );
    },

    /**
     * Fetch a hostname's current record (verified state, verification
     * tokens). Used for the refresh-status loop in the UI.
     */
    async getDomain(
      hostname: string,
    ): Promise<VercelDomainResult<VercelDomainRecord>> {
      return request<VercelDomainRecord>(
        `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}`,
        { method: "GET" },
      );
    },

    /**
     * Fetch the DNS-configuration check (CNAME / A record / SSL state).
     * Separate from getDomain so the orchestrator can poll only this
     * lighter endpoint after the initial registration.
     */
    async getDomainConfig(
      hostname: string,
    ): Promise<VercelDomainResult<VercelDomainConfig>> {
      return request<VercelDomainConfig>(
        `/v6/domains/${encodeURIComponent(hostname)}/config`,
        { method: "GET" },
      );
    },

    /**
     * Detach a hostname from the project. 404 is treated as `ok: true`
     * with `data: null` so re-deleting an already-removed domain is a
     * no-op (caller wants idempotency).
     */
    async removeDomain(
      hostname: string,
    ): Promise<VercelDomainResult<{ removed: true } | null>> {
      const result = await request<unknown>(
        `/v9/projects/${projectId}/domains/${encodeURIComponent(hostname)}`,
        { method: "DELETE" },
      );
      if (!result.ok && result.status === 404) {
        return { ok: true, data: null };
      }
      if (result.ok) {
        return { ok: true, data: { removed: true } };
      }
      return result as VercelDomainResult<never>;
    },
  };
}

export type VercelDomainClient = ReturnType<typeof createVercelDomainClient>;

/**
 * Read API credentials from env in one place so route handlers don't
 * sprinkle process.env checks. Throws when either is missing — that's
 * a hard config bug, not a runtime branch worth tolerating.
 */
export function vercelDomainClientFromEnv(): VercelDomainClient {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!apiToken) {
    throw new Error(
      "VERCEL_API_TOKEN is not set — required for custom-domain management.",
    );
  }
  if (!projectId) {
    throw new Error(
      "VERCEL_PROJECT_ID is not set — required for custom-domain management.",
    );
  }
  return createVercelDomainClient({
    apiToken,
    projectId,
    teamId: process.env.VERCEL_TEAM_ID ?? null,
  });
}
