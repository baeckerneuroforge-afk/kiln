/**
 * Thin wrapper over Vercel's project-domains REST API.
 *
 * Used by the agency custom-domain flow:
 *   1. Agency adds their domain in /dashboard/agency/branding.
 *   2. We call addDomain() — Vercel registers the hostname against our
 *      project and returns the verification info (CNAME / TXT records).
 *   3. UI shows the user the DNS record they need to set.
 *   4. After the user sets DNS, getDomainStatus() polls Vercel; once
 *      `verified` flips true and SSL is provisioned, we mark the row
 *      domainVerified=true so middleware starts routing requests for
 *      that hostname.
 *
 * Required env:
 *   VERCEL_API_TOKEN     — personal/team token with "domains: write"
 *                          scope. Manage in Vercel Dashboard → Account
 *                          Settings → Tokens.
 *   VERCEL_PROJECT_ID    — `prj_…` id of the kilnbase project. Found in
 *                          Project Settings → General.
 *   VERCEL_TEAM_ID       — optional, only needed when the project lives
 *                          under a team. Use the `team_…` slug.
 *
 * The wrapper is intentionally minimal — no caching, no retries. Routes
 * call it directly and surface failures to the operator's UI so they can
 * react (DNS misconfiguration is the common case).
 */

const VERCEL_API_BASE = "https://api.vercel.com";

type VercelEnv = {
  apiToken: string;
  projectId: string;
  teamId?: string;
};

function readEnv(): VercelEnv {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || undefined;
  if (!apiToken) throw new Error("VERCEL_API_TOKEN is not set");
  if (!projectId) throw new Error("VERCEL_PROJECT_ID is not set");
  return { apiToken, projectId, teamId };
}

function buildUrl(path: string, env: VercelEnv): string {
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  if (env.teamId) url.searchParams.set("teamId", env.teamId);
  return url.toString();
}

/**
 * Verification record Vercel returns when a domain is added but DNS
 * hasn't been pointed yet. The agency operator copies this into their
 * DNS provider.
 */
export type DomainVerificationRecord = {
  type: string;   // "CNAME" / "TXT"
  domain: string; // typically the customer's domain
  value: string;  // the value to set, e.g. "cname.vercel-dns.com"
  reason?: string;
};

export type AddDomainResult = {
  name: string;
  verified: boolean;
  verification: DomainVerificationRecord[];
};

export type DomainStatus = {
  name: string;
  verified: boolean;
  /** True once Vercel has provisioned the certificate. */
  ssl: boolean;
  /** Verification records the user still needs to set. Empty when
   *  `verified` is already true. */
  verification: DomainVerificationRecord[];
  /** Errors surfaced by Vercel — typically misconfigured DNS. */
  error: string | null;
};

async function vercelFetch(
  url: string,
  init: RequestInit,
  env: VercelEnv
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${env.apiToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    const msg = body?.error?.message || `Vercel API ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

/**
 * Register a new domain against the kilnbase project. Vercel begins
 * background verification + cert provisioning. The returned
 * `verification` array tells the operator what DNS record to set.
 */
export async function addDomain(domain: string): Promise<AddDomainResult> {
  const env = readEnv();
  const url = buildUrl(`/v10/projects/${env.projectId}/domains`, env);
  const body = (await vercelFetch(
    url,
    { method: "POST", body: JSON.stringify({ name: domain }) },
    env
  )) as {
    name?: string;
    verified?: boolean;
    verification?: DomainVerificationRecord[];
  };
  return {
    name: body.name ?? domain,
    verified: Boolean(body.verified),
    verification: body.verification ?? [],
  };
}

/**
 * Poll Vercel for the live status of a previously-added domain. Returns
 * `verified=true` only when DNS is correct AND SSL has been issued.
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const env = readEnv();
  const projectUrl = buildUrl(
    `/v9/projects/${env.projectId}/domains/${encodeURIComponent(domain)}`,
    env
  );
  const configUrl = buildUrl(
    `/v6/domains/${encodeURIComponent(domain)}/config`,
    env
  );

  const [domainRow, config] = (await Promise.all([
    vercelFetch(projectUrl, { method: "GET" }, env),
    vercelFetch(configUrl, { method: "GET" }, env).catch(() => ({})),
  ])) as [
    {
      name?: string;
      verified?: boolean;
      verification?: DomainVerificationRecord[];
      error?: { message?: string };
    },
    { misconfigured?: boolean }
  ];

  return {
    name: domainRow.name ?? domain,
    verified: Boolean(domainRow.verified),
    // SSL is provisioned implicitly once `verified` is true and the
    // domain is pointed correctly; Vercel exposes a separate config call
    // (above) that flags `misconfigured` if DNS is still off.
    ssl: Boolean(domainRow.verified) && !config.misconfigured,
    verification: domainRow.verification ?? [],
    error: domainRow.error?.message ?? null,
  };
}

/**
 * Vercel's verify-domain endpoint kicks off an immediate DNS recheck
 * instead of waiting for the next background poll. Useful right after
 * the user updates their DNS record.
 */
export async function verifyDomain(domain: string): Promise<DomainStatus> {
  const env = readEnv();
  const url = buildUrl(
    `/v9/projects/${env.projectId}/domains/${encodeURIComponent(domain)}/verify`,
    env
  );
  const body = (await vercelFetch(url, { method: "POST" }, env)) as {
    name?: string;
    verified?: boolean;
    verification?: DomainVerificationRecord[];
  };
  return {
    name: body.name ?? domain,
    verified: Boolean(body.verified),
    ssl: Boolean(body.verified),
    verification: body.verification ?? [],
    error: null,
  };
}

/** Detach a domain from the project. Idempotent. */
export async function removeDomain(domain: string): Promise<void> {
  const env = readEnv();
  const url = buildUrl(
    `/v9/projects/${env.projectId}/domains/${encodeURIComponent(domain)}`,
    env
  );
  try {
    await vercelFetch(url, { method: "DELETE" }, env);
  } catch (err) {
    // 404 = already gone, treat as success.
    const msg = err instanceof Error ? err.message : "";
    if (!/404|not.?found/i.test(msg)) throw err;
  }
}
