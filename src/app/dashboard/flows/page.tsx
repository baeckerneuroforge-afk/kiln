import { redirect } from "next/navigation";

// /dashboard/flows used to be a "Coming Q4 2026" stub for the planned Flow
// Engine (Phase 3). The visual workflow editor that lives under
// /dashboard/teams covers the same use case for now, so we redirect
// instead of stranding users on a teaser page they reach by clicking
// "Workflows" on the dashboard home.
export default function FlowsPage() {
  redirect("/dashboard/teams");
}
