import { redirect } from "next/navigation";

// /dashboard/workflows/templates used to be a second templates gallery
// alongside /dashboard/teams/new — both pages fetched /api/teams/templates
// and both linked onward to /dashboard/teams/new?template=… . Keeping two
// routes for the same gallery just splits where users learn the canonical
// URL is. /dashboard/teams/new is the one the in-app "Browse all
// templates" link uses, so we redirect here.
export default function WorkflowsTemplatesRedirect() {
  redirect("/dashboard/teams/new");
}
