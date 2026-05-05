/**
 * Types and the pure decision helper extracted from
 * src/components/agency-org-switcher.tsx so unit tests can import them
 * without pulling in the JSX-bearing component (vitest's JSX transform
 * doesn't apply when a .test.ts imports a .tsx — moving the testable
 * surface to a .ts file sidesteps that).
 */

export type Membership = {
  orgId: string;
  name: string;
  imageUrl: string | null;
};

export type SubOrgEntry = Membership & {
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export type AgencyEntry = Membership & { subOrgs: SubOrgEntry[] };

export type SwitcherData = {
  personal: Membership | null;
  agencies: AgencyEntry[];
  other: Membership[];
};

/**
 * Sorts API response into the three render buckets. The server already
 * does the heavy lifting; this helper just re-asserts the contract so
 * tests can pin it independently of the component.
 */
export function decideSwitcherSections(data: SwitcherData): {
  hasPersonal: boolean;
  agencyCount: number;
  totalSubOrgs: number;
  otherCount: number;
} {
  return {
    hasPersonal: data.personal !== null,
    agencyCount: data.agencies.length,
    totalSubOrgs: data.agencies.reduce(
      (acc, a) => acc + a.subOrgs.length,
      0
    ),
    otherCount: data.other.length,
  };
}

export const MEMBERSHIPS_ENDPOINT_PATH = "/api/agency/memberships";
