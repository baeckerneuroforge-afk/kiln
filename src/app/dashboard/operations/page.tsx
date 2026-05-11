import { redirect } from "next/navigation";

/**
 * Sprint 19.6 — /dashboard/operations is consolidated into /dashboard.
 * The unified router picks the operations view automatically for
 * established agencies and via the explicit "Operations cockpit"
 * preference. This page issues a permanent server-side redirect.
 */
export default function OperationsRedirect(): never {
  redirect("/dashboard");
}
