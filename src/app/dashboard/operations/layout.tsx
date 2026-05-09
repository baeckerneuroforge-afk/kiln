import { requireAgencyMode } from "@/lib/org-mode";

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  await requireAgencyMode();
  return <>{children}</>;
}
