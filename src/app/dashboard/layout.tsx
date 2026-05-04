"use client";

import { useEffect, useState, useCallback } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { UpgradeBanner } from "@/components/upgrade-banner";
import { CreditBanner } from "@/components/credit-banner";
import { ReferralApply } from "@/components/referral-apply";
import { AdvancedModeProvider } from "@/hooks/use-advanced-mode";
import { LegalFooter } from "@/components/legal-footer";
import { CookieBanner } from "@/components/cookie-banner";
import { ToastProvider } from "@/components/toast";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { KeyboardShortcutProvider } from "@/components/keyboard-shortcuts";
import { ProductTour, useTourTrigger } from "@/components/product-tour";
import { MetaAgentChat } from "@/components/meta-agent/meta-agent-chat";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PWAInstallPrompt } from "@/components/mobile/pwa-install-prompt";
import { OrgRequired } from "@/components/org-required";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const { showTour, completeTour, skipTour } = useTourTrigger();

  const checkOnboarding = useCallback(() => {
    Promise.all([
      fetch("/api/user/preferences").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
    ])
      .then(([prefs, agentsData]) => {
        const agents = agentsData.agents || agentsData || [];
        const hasAgents = Array.isArray(agents) && agents.length > 0;
        const completed = prefs.onboardingCompleted === true;
        setShowOnboarding(!hasAgents && !completed);
      })
      .catch(() => setShowOnboarding(false));
  }, []);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  // Show onboarding wizard if needed
  if (showOnboarding === true) {
    return <OnboardingWizard onSkip={() => setShowOnboarding(false)} />;
  }

  // Render the dashboard shell immediately — don't block on onboarding check
  return (
    <AdvancedModeProvider>
      <ToastProvider>
        <KeyboardShortcutProvider>
        <OrgRequired />
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
              <div className="ml-auto">
                <NotificationBell />
              </div>
            </div>
            <UpgradeBanner />
            <CreditBanner />
            <ReferralApply />
            <main className="flex-1 p-4 sm:p-6 lg:p-8">
              {showOnboarding === null ? (
                <DashboardSkeleton />
              ) : (
                children
              )}
            </main>
            <LegalFooter />
          </div>
        </div>
        {showOnboarding === false && <OnboardingChecklist />}
        {showTour && <ProductTour onComplete={completeTour} onSkip={skipTour} />}
        <CookieBanner />
        <MetaAgentChat />
        <PWAInstallPrompt />
        </KeyboardShortcutProvider>
      </ToastProvider>
    </AdvancedModeProvider>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="mt-2 h-4 w-72 rounded bg-muted" />
      </div>

      {/* Module cards skeleton */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 h-8 w-8 rounded-lg bg-muted" />
            <div className="mb-1 h-5 w-32 rounded bg-muted" />
            <div className="mb-4 h-4 w-full rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Stats skeleton */}
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="mt-2 h-7 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
