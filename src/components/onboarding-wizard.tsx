"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
  Dumbbell,
  Home,
  Briefcase,
  Wrench,
  UtensilsCrossed,
  Megaphone,
  MoreHorizontal,
  Wand2,
  MessageSquare,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentTemplates, type AgentTemplate } from "@/lib/agent-templates";

const industries = [
  { id: "fitness", label: "Fitness & Wellness", icon: Dumbbell, templateIds: ["yoga-studio"] },
  { id: "realestate", label: "Real Estate", icon: Home, templateIds: ["immobilienmakler"] },
  { id: "coaching", label: "Coaching & Consulting", icon: Briefcase, templateIds: ["business-coach"] },
  { id: "trades", label: "Trades / SHK", icon: Wrench, templateIds: ["shk-handwerker"] },
  { id: "restaurant", label: "Restaurant & Gastro", icon: UtensilsCrossed, templateIds: ["restaurant"] },
  { id: "agency", label: "Marketing Agency", icon: Megaphone, templateIds: [] },
  { id: "other", label: "Other", icon: MoreHorizontal, templateIds: [] },
];

interface OnboardingWizardProps {
  onDismiss: () => void;
}

export function OnboardingWizard({ onDismiss }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  const industry = industries.find((i) => i.id === selectedIndustry);
  const matchingTemplates = industry
    ? agentTemplates.filter((t) => industry.templateIds.includes(t.id))
    : [];

  async function saveCompanyName() {
    if (!companyName.trim()) return;
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: companyName.trim() }),
      });
    } catch {
      // Nicht blockierend
    }
  }

  async function handleCloneTemplate(template: AgentTemplate) {
    setCloning(true);
    await saveCompanyName();

    try {
      const slug = template.id + "-" + Date.now().toString(36).slice(-4);
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyName.trim()
            ? `${companyName.trim()} – ${template.name}`
            : template.name,
          slug,
          description: template.description,
          systemPrompt: template.systemPrompt,
          personality: template.personality,
          welcomeMessage: template.welcomeMessage,
          suggestedQuestions: template.suggestedQuestions,
          suggestedActions: template.suggestedActions,
        }),
      });

      if (!res.ok) throw new Error();
      const agent = await res.json();
      router.push(`/dashboard/agents/${agent.id}`);
    } catch {
      setCloning(false);
    }
  }

  async function handleDescribeAgent() {
    await saveCompanyName();
    router.push("/dashboard/agents/new");
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Skip Button */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>

      {/* Progress */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              s === step
                ? "w-8 bg-kiln-orange"
                : s < step
                  ? "w-8 bg-kiln-orange/40"
                  : "w-8 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Company Name */}
      {step === 1 && (
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-orange/10">
            <Sparkles className="h-8 w-8 text-kiln-orange" />
          </div>
          <h1 className="mb-2 font-serif text-3xl text-foreground">
            Welcome to KILN
          </h1>
          <p className="mb-8 max-w-md text-muted-foreground">
            Let&apos;s set up your first AI agent in under a minute.
          </p>

          <div className="w-full max-w-md">
            <label className="mb-2 block text-left text-sm font-medium text-foreground">
              What&apos;s your company name?
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Coaching"
              autoFocus
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
              onKeyDown={(e) => {
                if (e.key === "Enter" && companyName.trim()) {
                  setStep(2);
                }
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              This helps us personalize your agent. You can change it later.
            </p>
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!companyName.trim()}
            className="mt-6"
            size="lg"
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Industry */}
      {step === 2 && (
        <div className="flex flex-col items-center text-center">
          <h1 className="mb-2 font-serif text-3xl text-foreground">
            What&apos;s your industry?
          </h1>
          <p className="mb-8 text-muted-foreground">
            We&apos;ll suggest the best template for your business.
          </p>

          <div className="grid w-full gap-3 sm:grid-cols-2">
            {industries.map((ind) => {
              const Icon = ind.icon;
              const isSelected = selectedIndustry === ind.id;
              return (
                <button
                  key={ind.id}
                  onClick={() => setSelectedIndustry(ind.id)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-kiln-orange bg-kiln-orange/5 ring-1 ring-kiln-orange"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? "bg-kiln-orange/10" : "bg-muted"
                  }`}>
                    <Icon className={`h-5 w-5 ${isSelected ? "text-kiln-orange" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                    {ind.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button variant="outline" onClick={() => setStep(1)} size="lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!selectedIndustry}
              size="lg"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Choose how to start */}
      {step === 3 && (
        <div className="flex flex-col items-center text-center">
          <h1 className="mb-2 font-serif text-3xl text-foreground">
            Choose how to start
          </h1>
          <p className="mb-8 text-muted-foreground">
            Pick a template or describe your agent from scratch.
          </p>

          <div className="w-full space-y-4">
            {/* Templates */}
            {matchingTemplates.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recommended Templates
                </h3>
                {matchingTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleCloneTemplate(template)}
                    disabled={cloning}
                    className="group flex w-full items-center gap-4 rounded-xl border border-kiln-orange/30 bg-kiln-orange/5 p-5 text-left transition-all hover:border-kiln-orange hover:shadow-lg disabled:opacity-50"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                      {template.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground">{template.name}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {cloning ? (
                        <Loader2 className="h-5 w-5 animate-spin text-kiln-orange" />
                      ) : (
                        <Wand2 className="h-5 w-5 text-kiln-orange transition-transform group-hover:scale-110" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Divider */}
            {matchingTemplates.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {/* Describe from scratch */}
            <button
              onClick={handleDescribeAgent}
              disabled={cloning}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-muted-foreground/30 hover:shadow-lg disabled:opacity-50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-foreground">Describe your agent</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tell us what your agent should do and we&apos;ll build it for you.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Browse all templates */}
            <button
              onClick={async () => {
                await saveCompanyName();
                router.push("/dashboard/agents/templates");
              }}
              disabled={cloning}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Browse all templates
            </button>
          </div>

          <div className="mt-6">
            <Button variant="outline" onClick={() => setStep(2)} size="lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
