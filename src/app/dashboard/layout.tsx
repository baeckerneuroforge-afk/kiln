import { Sidebar } from "@/components/sidebar";
import { UpgradeBanner } from "@/components/upgrade-banner";
import { ReferralApply } from "@/components/referral-apply";
import { AdvancedModeProvider } from "@/hooks/use-advanced-mode";
import { LegalFooter } from "@/components/legal-footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdvancedModeProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-y-auto">
          <UpgradeBanner />
          <ReferralApply />
          <main className="flex-1 p-6 lg:p-8">{children}</main>
          <LegalFooter />
        </div>
      </div>
    </AdvancedModeProvider>
  );
}
