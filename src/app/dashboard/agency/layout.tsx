import { requireAgencyMode } from "@/lib/org-mode";

export default async function AgencyDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAgencyMode();
  return <>{children}</>;
}
