import { redirect } from "next/navigation";

// /dashboard/workflows had no page.tsx — anyone typing the bare path
// landed on a 404. The actual workflow editor lives at /dashboard/teams
// (see docs/WORKFLOW_ROUTING_AUDIT.md). This redirect keeps the URL
// reachable for old bookmarks and external links without giving the
// impression that a separate workflows editor exists.
export default function WorkflowsRedirect() {
  redirect("/dashboard/teams");
}
