/**
 * Sprint 19.7.1 — sub-org provisioning helpers.
 */
import { describe, expect, it, vi } from "vitest";
import {
  addOwnerMembership,
  agencyMetadata,
  KILN_TYPE_AGENCY,
  KILN_TYPE_SUB_ORG,
  subOrgMetadata,
} from "@/lib/sub-org/provision";

describe("subOrgMetadata / agencyMetadata", () => {
  it("subOrgMetadata carries kiln_type=sub_org and parentAgencyOrgId", () => {
    const meta = subOrgMetadata("org_agency_42");
    expect(meta.kiln_type).toBe(KILN_TYPE_SUB_ORG);
    expect(meta.parentAgencyOrgId).toBe("org_agency_42");
  });

  it("agencyMetadata carries kiln_type=agency only", () => {
    const meta = agencyMetadata();
    expect(meta.kiln_type).toBe(KILN_TYPE_AGENCY);
  });
});

describe("addOwnerMembership", () => {
  it("upserts an OWNER/FULL_ACCESS row keyed by (subOrgId,userId)", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "mem_1" });
    const client = { subOrgMembership: { upsert } } as unknown as Parameters<
      typeof addOwnerMembership
    >[1];

    await addOwnerMembership({ subOrgId: "sub_1", userId: "user_42" }, client);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subOrgId_userId: { subOrgId: "sub_1", userId: "user_42" } },
        create: expect.objectContaining({
          subOrgId: "sub_1",
          userId: "user_42",
          role: "OWNER",
          permissionSet: "FULL_ACCESS",
        }),
        update: {},
      }),
    );
  });

  it("uses upsert with an empty update body so re-runs don't downgrade existing rows", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "mem_existing" });
    const client = { subOrgMembership: { upsert } } as unknown as Parameters<
      typeof addOwnerMembership
    >[1];

    await addOwnerMembership({ subOrgId: "sub_1", userId: "user_1" }, client);
    await addOwnerMembership({ subOrgId: "sub_1", userId: "user_1" }, client);

    expect(upsert).toHaveBeenCalledTimes(2);
    for (const call of upsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });
});
