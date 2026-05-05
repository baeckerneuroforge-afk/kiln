import { describe, expect, it } from "vitest";
// Import the pure helper from the .ts module, not the .tsx component.
// The .test.ts file only needs the decision logic; pulling the JSX-bearing
// component would require a different vitest transform setup.
import { decideSwitcherSections } from "@/components/agency-org-switcher-types";

const personal = { orgId: "org_personal", name: "Andre's Workspace", imageUrl: null };

describe("decideSwitcherSections", () => {
  it("counts all three buckets when present", () => {
    const result = decideSwitcherSections({
      personal,
      agencies: [
        {
          orgId: "org_agency_1",
          name: "Agency A",
          imageUrl: null,
          subOrgs: [
            { orgId: "org_sub_1", name: "Client X", imageUrl: null, status: "ACTIVE" },
            { orgId: "org_sub_2", name: "Client Y", imageUrl: null, status: "ACTIVE" },
          ],
        },
        {
          orgId: "org_agency_2",
          name: "Agency B",
          imageUrl: null,
          subOrgs: [],
        },
      ],
      other: [{ orgId: "org_invited", name: "Invited Workspace", imageUrl: null }],
    });

    expect(result).toEqual({
      hasPersonal: true,
      agencyCount: 2,
      totalSubOrgs: 2,
      otherCount: 1,
    });
  });

  it("zero personal works (user without a personalOrgId yet)", () => {
    const result = decideSwitcherSections({
      personal: null,
      agencies: [],
      other: [],
    });
    expect(result.hasPersonal).toBe(false);
    expect(result.agencyCount).toBe(0);
    expect(result.totalSubOrgs).toBe(0);
    expect(result.otherCount).toBe(0);
  });

  it("agencies without sub-orgs still count as agencies", () => {
    const result = decideSwitcherSections({
      personal: null,
      agencies: [
        { orgId: "org_a", name: "Empty Agency", imageUrl: null, subOrgs: [] },
      ],
      other: [],
    });
    expect(result.agencyCount).toBe(1);
    expect(result.totalSubOrgs).toBe(0);
  });
});
