import { Sidebar } from "@/components/sidebar";
import { UpgradeBanner } from "@/components/upgrade-banner";
import { ReferralApply } from "@/components/referral-apply";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <UpgradeBanner />
        <ReferralApply />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
