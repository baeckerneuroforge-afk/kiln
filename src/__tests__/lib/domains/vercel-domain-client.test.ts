/**
 * Sprint 19.8 — Vercel Domains API wrapper.
 */
import { describe, expect, it, vi } from "vitest";
import { createVercelDomainClient } from "@/lib/domains/vercel-domain-client";

function makeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn().mockImplementation(impl);
}

const baseArgs = {
  apiToken: "test-token",
  projectId: "prj_test",
};

describe("createVercelDomainClient.addDomain", () => {
  it("POSTs to /v10/projects/[id]/domains with the hostname", async () => {
    const fetchImpl = makeFetch(async (url, init) => {
      expect(url).toContain("/v10/projects/prj_test/domains");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ name: "ai.x.de" });
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-token");
      return new Response(
        JSON.stringify({ id: "dom_1", name: "ai.x.de", verified: false }),
        { status: 200 },
      );
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const result = await client.addDomain("ai.x.de");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe("dom_1");
      expect(result.data.verified).toBe(false);
    }
  });

  it("returns ok=false with status + message on 4xx", async () => {
    const fetchImpl = makeFetch(async () => {
      return new Response(
        JSON.stringify({
          error: { code: "domain_taken", message: "domain already in use" },
        }),
        { status: 409 },
      );
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const result = await client.addDomain("taken.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("domain already in use");
      expect(result.code).toBe("domain_taken");
    }
  });

  it("attaches teamId as query string when provided", async () => {
    const fetchImpl = makeFetch(async (url) => {
      expect(url).toContain("teamId=team_1");
      return new Response(JSON.stringify({ id: "dom_1", name: "ai.x.de" }), {
        status: 200,
      });
    });
    const client = createVercelDomainClient({
      ...baseArgs,
      teamId: "team_1",
      fetchImpl,
    });
    const r = await client.addDomain("ai.x.de");
    expect(r.ok).toBe(true);
  });

  it("returns ok=false network_error when fetch throws", async () => {
    const fetchImpl = makeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const r = await client.addDomain("ai.x.de");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.code).toBe("network_error");
    }
  });
});

describe("createVercelDomainClient.verifyDomain", () => {
  it("POSTs to /v9/.../verify and returns the verified record", async () => {
    const fetchImpl = makeFetch(async (url, init) => {
      expect(url).toContain(
        "/v9/projects/prj_test/domains/ai.x.de/verify",
      );
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({ id: "dom_1", name: "ai.x.de", verified: true }),
        { status: 200 },
      );
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const r = await client.verifyDomain("ai.x.de");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.verified).toBe(true);
  });

  it("encodes the hostname in the URL", async () => {
    const fetchImpl = makeFetch(async (url) => {
      expect(url).toContain("/domains/ai.x.de/");
      return new Response("{}", { status: 200 });
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    await client.verifyDomain("ai.x.de");
  });
});

describe("createVercelDomainClient.removeDomain", () => {
  it("returns ok=true on successful delete", async () => {
    const fetchImpl = makeFetch(async () => new Response(null, { status: 204 }));
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const r = await client.removeDomain("ai.x.de");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ removed: true });
  });

  it("treats 404 as ok=true with data=null (idempotent)", async () => {
    const fetchImpl = makeFetch(async () => {
      return new Response(
        JSON.stringify({ error: { code: "not_found" } }),
        { status: 404 },
      );
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const r = await client.removeDomain("ai.x.de");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBeNull();
  });

  it("returns ok=false on non-404 errors", async () => {
    const fetchImpl = makeFetch(async () => {
      return new Response(JSON.stringify({ error: { message: "boom" } }), {
        status: 500,
      });
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const r = await client.removeDomain("ai.x.de");
    expect(r.ok).toBe(false);
  });
});

describe("createVercelDomainClient.getDomainConfig", () => {
  it("hits /v6/domains/[host]/config", async () => {
    const fetchImpl = makeFetch(async (url) => {
      expect(url).toContain("/v6/domains/ai.x.de/config");
      return new Response(
        JSON.stringify({ configured: true, misconfigured: false }),
        { status: 200 },
      );
    });
    const client = createVercelDomainClient({ ...baseArgs, fetchImpl });
    const r = await client.getDomainConfig("ai.x.de");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.configured).toBe(true);
      expect(r.data.misconfigured).toBe(false);
    }
  });
});
