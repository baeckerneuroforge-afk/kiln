"use client";

import { useEffect, useState } from "react";
import type { OrgMode, OrgModeDetails } from "@/lib/org-mode";

type OrgModeState = OrgModeDetails & {
  loading: boolean;
};

const initialState: OrgModeState = {
  loading: true,
  mode: "STANDALONE",
  orgId: "",
  parentOrgId: null,
  subOrgName: null,
  brandColor: null,
  logoUrl: null,
};

export function useOrgMode(): OrgMode | null {
  const details = useOrgModeDetails();
  return details.loading ? null : details.mode;
}

export function useOrgModeDetails(): OrgModeState {
  const [state, setState] = useState<OrgModeState>(initialState);

  useEffect(() => {
    let cancelled = false;

    async function loadMode() {
      try {
        const response = await fetch("/api/org/mode", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load org mode");
        }
        const data = (await response.json()) as OrgModeDetails;
        if (!cancelled) {
          setState({ ...data, loading: false });
        }
      } catch {
        if (!cancelled) {
          setState({ ...initialState, loading: false });
        }
      }
    }

    void loadMode();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
