/**
 * Sprint 19.8.1 — agency-domain-manager orchestrator.
 *
 * Tests the create/verify/remove paths + the single-row invariant +
 * the cross-table conflict check against CustomDomain. Vercel client
 * + Prisma are injected so no network / DB is touched.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createAgencyDomain,
  findHostnameOwner,
  removeAgencyDomain,
  verifyAgencyDomain,
} from "@/lib/domains/agency-domain-manager";
import type { VercelDomainClient } from "@/lib/domains/vercel-domain-client";

function makePrisma(opts: {
  selfAgencyDomain?: { id: string; agencyOrgId: string; hostname: string } | null;
  customDomain?: { subOrgId: string } | null;
  otherAgencyForAgency?: { id: string } | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
  return {
    prisma: {
      agencyDomain: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.hostname) return opts.selfAgencyDomain ?? null;
          if (where.id && opts.selfAgencyDomain?.id === where.id) {
            return opts.selfAgencyDomain;
          }
          return null;
        }),
        findFirst: vi.fn().mockResolvedValue(opts.otherAgencyForAgency ?? null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "agd_new", ...data };
          created.push(data);
          return row;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updated.push({ where, data });
          return { ...(opts.selfAgencyDomain ?? {}), ...data, id: where.id };
        }),
        delete: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          deleted.push(where.id);
          return { id: where.id };
        }),
      },
      customDomain: {
        findUnique: vi.fn().mockResolvedValue(opts.customDomain ?? null),
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

describe("findHostnameOwner", () => {
  it("returns kind=free when neither table has the hostname", async () => {
    const { prisma } = makePrisma({});
    const r = await findHostnameOwner("nobody.de", prisma);
    expect(r).toEqual({ kind: "free" });
  });

  it("returns sub-org owner when CustomDomain has the hostname", async () => {
    const { prisma } = makePrisma({
      customDomain: { subOrgId: "sub_1" },
    });
    const r = await findHostnameOwner("sub.de", prisma);
    expect(r).toEqual({ kind: "sub-org", subOrgId: "sub_1" });
  });

  it("returns agency owner when AgencyDomain has the hostname", async () => {
    const { prisma } = makePrisma({
      selfAgencyDomain: {
        id: "agd_1",
        agencyOrgId: "org_agency",
        hostname: "agency.de",
      },
    });
    const r = await findHostnameOwner("agency.de", prisma);
    expect(r).toEqual({ kind: "agency", agencyOrgId: "org_agency" });
  });
});

describe("createAgencyDomain", () => {
  it("rejects an invalid hostname before touching Vercel", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({});
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "no-dot" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_hostname");
    expect(vercel.addDomain).not.toHaveBeenCalled();
  });

  it("re-returns existing row when same agency re-creates same hostname", async () => {
    const existing = {
      id: "agd_1",
      agencyOrgId: "org_agency",
      hostname: "agency.de",
    };
    const { prisma } = makePrisma({ selfAgencyDomain: existing });
    const vercel = makeVercel({});
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "agency.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.domain).toEqual(existing);
    expect(vercel.addDomain).not.toHaveBeenCalled();
  });

  it("returns hostname_taken when row exists for a different agency", async () => {
    const { prisma } = makePrisma({
      selfAgencyDomain: {
        id: "agd_1",
        agencyOrgId: "org_other",
        hostname: "agency.de",
      },
    });
    const vercel = makeVercel({});
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "agency.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("hostname_taken");
  });

  it("returns hostname_taken when CustomDomain has the hostname", async () => {
    const { prisma } = makePrisma({
      customDomain: { subOrgId: "sub_1" },
    });
    const vercel = makeVercel({});
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "agency.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("hostname_taken");
  });

  it("returns agency_domain_exists when this agency already has another domain", async () => {
    const { prisma } = makePrisma({
      otherAgencyForAgency: { id: "agd_existing" },
    });
    const vercel = makeVercel({});
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "new.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("agency_domain_exists");
  });

  it("registers and persists with verified=false → VERIFYING", async () => {
    const { prisma, created } = makePrisma({});
    const vercel = makeVercel({
      addDomain: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          id: "vd_1",
          name: "agency.de",
          verified: false,
          verification: [
            { type: "TXT", domain: "_vercel.agency.de", value: "abc", reason: "x" },
          ],
        },
      }),
    });
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "AGENCY.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.domain.hostname).toBe("agency.de");
      expect(r.domain.status).toBe("VERIFYING");
      expect(r.verification?.[0]?.value).toBe("abc");
    }
    expect(created[0]).toMatchObject({
      hostname: "agency.de",
      status: "VERIFYING",
      verificationToken: "abc",
      vercelDomainId: "vd_1",
    });
  });

  it("marks ACTIVE when Vercel returns verified=true", async () => {
    const { prisma, created } = makePrisma({});
    const vercel = makeVercel({
      addDomain: vi.fn().mockResolvedValue({
        ok: true,
        data: { id: "vd_1", name: "agency.de", verified: true },
      }),
    });
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "agency.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    expect(created[0]?.status).toBe("ACTIVE");
  });

  it("surfaces Vercel errors", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({
      addDomain: vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        error: "already attached to another project",
        code: "domain_taken",
      }),
    });
    const r = await createAgencyDomain(
      { agencyOrgId: "org_agency", hostname: "agency.de" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("domain_taken");
  });
});

describe("verifyAgencyDomain", () => {
  it("404s when the domain row doesn't exist", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({});
    const r = await verifyAgencyDomain(
      { domainId: "agd_missing" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("domain_not_found");
  });

  it("marks FAILED on Vercel verify failure", async () => {
    const existing = {
      id: "agd_1",
      agencyOrgId: "org_agency",
      hostname: "agency.de",
    };
    const { prisma, updated } = makePrisma({ selfAgencyDomain: existing });
    const vercel = makeVercel({
      verifyDomain: vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        error: "verification failed",
      }),
    });
    const r = await verifyAgencyDomain(
      { domainId: "agd_1" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    expect(
      updated.find((u) => (u.data as { status?: string })?.status === "FAILED"),
    ).toBeTruthy();
  });

  it("marks ACTIVE + ISSUED + sslIssuedAt on first verified=true", async () => {
    const existing = {
      id: "agd_1",
      agencyOrgId: "org_agency",
      hostname: "agency.de",
    };
    const { prisma, updated } = makePrisma({ selfAgencyDomain: existing });
    const vercel = makeVercel({
      verifyDomain: vi.fn().mockResolvedValue({
        ok: true,
        data: { id: "vd_1", name: "agency.de", verified: true },
      }),
    });
    const r = await verifyAgencyDomain(
      { domainId: "agd_1" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    const data = updated[0]?.data as Record<string, unknown>;
    expect(data.status).toBe("ACTIVE");
    expect(data.sslStatus).toBe("ISSUED");
    expect(data.sslIssuedAt).toBeInstanceOf(Date);
  });
});

describe("removeAgencyDomain", () => {
  it("calls Vercel.remove + deletes row", async () => {
    const existing = {
      id: "agd_1",
      agencyOrgId: "org_agency",
      hostname: "agency.de",
    };
    const { prisma, deleted } = makePrisma({ selfAgencyDomain: existing });
    const removeFn = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { removed: true } });
    const vercel = makeVercel({ removeDomain: removeFn });
    const r = await removeAgencyDomain(
      { domainId: "agd_1" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(true);
    expect(removeFn).toHaveBeenCalledWith("agency.de");
    expect(deleted).toContain("agd_1");
  });

  it("404 when row doesn't exist", async () => {
    const { prisma } = makePrisma({});
    const vercel = makeVercel({});
    const r = await removeAgencyDomain(
      { domainId: "agd_missing" },
      { prisma, vercel },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("domain_not_found");
  });
});
