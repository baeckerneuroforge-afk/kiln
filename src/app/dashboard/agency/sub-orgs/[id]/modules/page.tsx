import { ModuleSettingsPage } from "@/components/sub-orgs/modules/ModuleSettingsPage";

export const dynamic = "force-dynamic";

/**
 * Sprint 19.5.2 — agency-side page where the agency owner configures
 * each module (AI, SMS, Voice, WhatsApp) per sub-account. Lives under
 * the same /dashboard/agency/sub-orgs/[id] umbrella as the existing
 * sub-org detail page, so the back link returns there.
 *
 * Server component is intentionally thin: the client component owns
 * data loading via /api/agency/sub-orgs/[id]/modules and handles all
 * mutations directly through the existing configure + toggle routes.
 */
export default function ModuleSettingsRoutePage({
  params,
}: {
  params: { id: string };
}) {
  return <ModuleSettingsPage relationshipId={params.id} />;
}
