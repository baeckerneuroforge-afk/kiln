/**
 * Sprint 19.8 — domain-manager orchestrator.
 *
 * Bridges the Vercel API + KILN's CustomDomain table. Tests use
 * injected Prisma + Vercel-client fakes so they stay deterministic
 * and don't hit either real system.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createCustomDomain,
  removeCustomDomain,
  verifyDomain,
} from "@/lib/domains/domain-manager";
import type { VercelDomainClient } from "@/lib/domains/vercel-domain-client";

function makePrisma(opts: {
  subOrgExists?: boolean;
  existingDomain?:
    | {
        id: string;
        subOrgId: string;
        hostname: string;
        status: string;
        sslIssuedAt: Date | null;
        sslStatus: string | null;
        verificationToken: string | null;
      }
    | null;
  /**
   * Sprint 19.8.1 — cross-table check. When set, the createCustomDomain
   * code path sees an AgencyDomain row for this hostname and refuses.
   */
  existingAgencyDomain?:
    | { agencyOrgId: string; hostname: string }
    | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const deleted: Array<Record<string, unknown>> = [];
  return {
    prisma: {
      orgRelationship: {
        findUnique: vi
          .fn()
          .mockResolvedValue(opts.subOrgExists !== false ? { id: "sub_1" } : null),
      },
      customDomain: {
        findUnique: vi.fn().mockImplementation(async (args) => {
          if (
            args.where?.hostname &&
            opts.existingDomain &&
            opts.existingDomain.hostname === args.where.hostname
          ) {
            return opts.existingDomain;
          }
          if (
            args.where?.id &&
            opts.existingDomain &&
            opts.existingDomain.id === args.where.id
          ) {
            return opts.existingDomain;
          }
          return null;
        }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "dom_new", ...data };
          created.push(data);
          return row;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updated.push({ where, data });
          return { ...opts.existingDomain, ...data };
        }),
        delete: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          deleted.push(where);
          return { id: where.id };
        }),
      },
      // Sprint 19.8.1 cross-table check — return any AgencyDomain row
      // the test wants the create path to find for the same hostname.
      agencyDomain: {
        findUnique: vi.fn().mockImplementation(async (args) => {
          if (
            args.where?.hostname &&
            opts.existingAgencyDomain?.hostname === args.where.hostname
          ) {
            return opts.existingAgencyDomain;
          }
          return null;
        }),
      },
    },
    created,
    updated,
    deleted,
  };
}

function makeVercel(impl: Partial<VercelDomainClient>): VercelDomainClient {
  return {
    addDomain: vi.fn(),
    verifyDomain: vi.fn(),
    getDomain: vi.fn(),
    getDomainConfig: vi.fn(),
    removeDomain: vi.fn(),
    ...impl,
  } as VercelDomainClient;
}

describe("createCustomDomain", () => {
  it("rejects an invalid hostname before touching Vercel", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({});
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "no-dot" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_hostname");
    expect(vercel.addDomain).not.toHaveBeenCalled();
  });

  it("404s when the sub-org doesn't exist", async () => {
    const { prisma } = makePrisma({ subOrgExists: false });
    const vercel = makeVercel({});
    const r = await createCustomDomain(
      { subOrgId: "sub_bogus", hostname: "ai.x.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("sub_org_not_found");
  });

  it("rejects when hostname is already attached to a different sub-org", async () => {
    const { prisma } = makePrisma({
      existingDomain: {
        id: "dom_x",
        subOrgId: "sub_other",
        hostname: "ai.x.de",
        status: "ACTIVE",
        sslIssuedAt: null,
        sslStatus: null,
        verificationToken: null,
      },
    });
    const vercel = makeVercel({});
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "ai.x.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("hostname_taken");
  });

  it("Sprint 19.8.1 — refuses when hostname is already configured as an agency domain", async () => {
    const { prisma } = makePrisma({
      existingAgencyDomain: { agencyOrgId: "org_agency", hostname: "ai.x.de" },
    });
    const vercel = makeVercel({});
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "ai.x.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("hostname_taken");
    // No Vercel call: cross-table conflict detected at DB layer.
    expect(vercel.addDomain).not.toHaveBeenCalled();
  });

  it("returns the existing row when re-creating the same hostname on the same sub-org", async () => {
    const existing = {
      id: "dom_x",
      subOrgId: "sub_1",
      hostname: "ai.x.de",
      status: "ACTIVE",
      sslIssuedAt: null,
      sslStatus: null,
      verificationToken: null,
    };
    const { prisma } = makePrisma({ existingDomain: existing });
    const vercel = makeVercel({});
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "ai.x.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.domain).toBe(existing);
    expect(vercel.addDomain).not.toHaveBeenCalled();
  });

  it("registers a new hostname with Vercel and stores the row", async () => {
    const { prisma, created } = makePrisma({});
    const vercel = makeVercel({
      addDomain: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          id: "vd_1",
          name: "ai.x.de",
          verified: false,
          verification: [
            {
              type: "TXT",
              domain: "_vercel.ai.x.de",
              value: "abc123",
              reason: "domain_verification",
            },
          ],
        },
      }),
    });
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "AI.X.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.domain.hostname).toBe("ai.x.de");
      expect(r.domain.status).toBe("VERIFYING");
      expect(r.verification?.[0]?.value).toBe("abc123");
    }
    expect(vercel.addDomain).toHaveBeenCalledWith("ai.x.de");
    expect(created[0]).toMatchObject({
      hostname: "ai.x.de",
      status: "VERIFYING",
      verificationToken: "abc123",
      vercelDomainId: "vd_1",
    });
  });

  it("marks ACTIVE when Vercel returns verified=true", async () => {
    const { prisma, created } = makePrisma({});
    const vercel = makeVercel({
      addDomain: vi.fn().mockResolvedValue({
        ok: true,
        data: { id: "vd_1", name: "ai.x.de", verified: true },
      }),
    });
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "ai.x.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    expect(created[0]?.status).toBe("ACTIVE");
  });

  it("passes Vercel errors through to the caller", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({
      addDomain: vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        error: "domain already in use",
        code: "domain_taken",
      }),
    });
    const r = await createCustomDomain(
      { subOrgId: "sub_1", hostname: "ai.x.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("domain_taken");
      expect(r.error).toBe("domain already in use");
    }
  });
});

describe("verifyDomain", () => {
  it("404s when the domain row doesn't exist", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({});
    const r = await verifyDomain({ domainId: "dom_missing" }, { prisma, vercel });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("domain_not_found");
  });

  it("marks FAILED when Vercel verify fails", async () => {
    const existing = {
      id: "dom_1",
      subOrgId: "sub_1",
      hostname: "ai.x.de",
      status: "VERIFYING",
      sslIssuedAt: null,
      sslStatus: null,
      verificationToken: null,
    };
    const { prisma, updated } = makePrisma({ existingDomain: existing });
    const vercel = makeVercel({
      verifyDomain: vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        error: "verification failed",
      }),
    });
    const r = await verifyDomain({ domainId: "dom_1" }, { prisma, vercel });
    expect(r.ok).toBe(false);
    expect(updated.find((u) => (u.data as { status?: string })?.status === "FAILED")).toBeTruthy();
  });

  it("sets ACTIVE + ISSUED + sslIssuedAt on first successful verify", async () => {
    const existing = {
      id: "dom_1",
      subOrgId: "sub_1",
      hostname: "ai.x.de",
      status: "VERIFYING",
      sslIssuedAt: null,
      sslStatus: null,
      verificationToken: null,
    };
    const { prisma, updated } = makePrisma({ existingDomain: existing });
    const vercel = makeVercel({
      verifyDomain: vi.fn().mockResolvedValue({
        ok: true,
        data: { id: "vd_1", name: "ai.x.de", verified: true },
      }),
    });
    const r = await verifyDomain({ domainId: "dom_1" }, { prisma, vercel });
    expect(r.ok).toBe(true);
    const data = updated[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("ACTIVE");
    expect(data.sslStatus).toBe("ISSUED");
    expect(data.sslIssuedAt).toBeInstanceOf(Date);
  });
});

describe("removeCustomDomain", () => {
  it("calls Vercel remove + deletes the row", async () => {
    const existing = {
      id: "dom_1",
      subOrgId: "sub_1",
      hostname: "ai.x.de",
      status: "ACTIVE",
      sslIssuedAt: null,
      sslStatus: null,
      verificationToken: null,
    };
    const { prisma, deleted } = makePrisma({ existingDomain: existing });
    const removeVercel = vi.fn().mockResolvedValue({
      ok: true,
      data: { removed: true },
    });
    const vercel = makeVercel({ removeDomain: removeVercel });
    const r = await removeCustomDomain({ domainId: "dom_1" }, { prisma, vercel });
    expect(r.ok).toBe(true);
    expect(removeVercel).toHaveBeenCalledWith("ai.x.de");
    expect(deleted[0]).toEqual({ id: "dom_1" });
  });

  it("404s when the row doesn't exist", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({});
    const r = await removeCustomDomain({ domainId: "dom_missing" }, { prisma, vercel });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("domain_not_found");
  });
});
