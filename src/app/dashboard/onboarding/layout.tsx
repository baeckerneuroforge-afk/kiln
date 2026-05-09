import { requireAgencyMode } from "@/lib/org-mode";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireAgencyMode();
  return <>{children}</>;
}
