"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { UpgradeBanner } from "@/components/upgrade-banner";
import { ReferralApply } from "@/components/referral-apply";
import { AdvancedModeProvider } from "@/hooks/use-advanced-mode";
import { LegalFooter } from "@/components/legal-footer";
import { CookieBanner } from "@/components/cookie-banner";
import { ToastProvider } from "@/components/toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AdvancedModeProvider>
      <ToastProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex flex-1 flex-col overflow-y-auto">
            {/* Mobile header */}
            <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-kiln-orange to-kiln-ember">
                  <span className="font-serif text-sm font-bold text-white">K</span>
                </div>
                <span className="font-serif text-lg text-foreground">KILN</span>
              </div>
            </div>
            <UpgradeBanner />
            <ReferralApply />
            <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
            <LegalFooter />
          </div>
        </div>
        <CookieBanner />
      </ToastProvider>
    </AdvancedModeProvider>
  );
}
