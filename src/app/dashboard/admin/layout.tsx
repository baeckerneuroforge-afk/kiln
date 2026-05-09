import { requireAgencyMode } from "@/lib/org-mode";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAgencyMode();
  return <>{children}</>;
}
