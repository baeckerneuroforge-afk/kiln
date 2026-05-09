import { requireAgencyMode } from "@/lib/org-mode";

export default async function TemplatesLayout({ children }: { children: React.ReactNode }) {
  await requireAgencyMode();
  return <>{children}</>;
}
