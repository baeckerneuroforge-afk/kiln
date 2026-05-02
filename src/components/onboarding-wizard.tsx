"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Zap,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  Loader2,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const INDUSTRIES = [
  { id: "real-estate", label: "Real Estate", prompt: "A professional real estate assistant that helps visitors find properties, schedule viewings, and answer questions about listings." },
  { id: "ecommerce", label: "E-Commerce", prompt: "A helpful e-commerce assistant that answers product questions, helps with orders, and handles returns." },
  { id: "saas", label: "SaaS / Tech", prompt: "A SaaS support agent that helps users with onboarding, feature questions, and troubleshooting." },
  { id: "health", label: "Health & Wellness", prompt: "A wellness assistant that helps clients book appointments, answer FAQ, and provide general information." },
  { id: "legal", label: "Legal / Consulting", prompt: "A professional consulting assistant that qualifies leads, schedules consultations, and answers common legal questions." },
  { id: "restaurant", label: "Restaurant / Hospitality", prompt: "A restaurant concierge that takes reservations, answers menu questions, and handles special requests." },
  { id: "custom", label: "Something else...", prompt: "" },
];

export function OnboardingWizard({ onSkip }: { onSkip?: () => void } = {}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"CHAT" | "TASK" | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<{ id: string; slug: string; name: string } | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [skipping, setSkipping] = useState(false);

  async function skipOnboarding() {
    setSkipping(true);
    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
      if (onSkip) {
        onSkip();
      } else {
        router.push("/dashboard");
      }
    } catch {
      router.push("/dashboard");
    }
  }

  async function createAgent() {
    setCreating(true);
    try {
      const industry = INDUSTRIES.find((i) => i.id === selectedIndustry);
      const description = selectedIndustry === "custom"
        ? customDescription
        : industry?.prompt || customDescription;

      // /api/ai/generate-agent is a streaming SSE endpoint for the conversational
      // builder, not a CRUD create — onboarding goes straight to /api/agents.
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: industry?.label ? `${industry.label} Assistant` : "My First Agent",
          systemPrompt: description || "You are a helpful AI assistant.",
          description: description?.slice(0, 200) || "Created during onboarding",
          mode: mode || "CHAT",
          status: "LIVE",
        }),
      });
      const data = await res.json();
      setCreatedAgent({ id: data.id, slug: data.slug, name: data.name });

      // Mark onboarding as completed
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });

      setStep(mode === "CHAT" ? 5 : 6);
    } catch {
      // Mark onboarding completed even on error so user isn't stuck
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      }).catch(() => {});
      router.push("/dashboard/agents");
    } finally {
      setCreating(false);
    }
  }

  const embedCode = createdAgent
    ? `<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/${createdAgent.slug}" width="400" height="600" style="border:none;border-radius:16px" allow="clipboard-write"></iframe>`
    : "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-sm">
            <span className="font-serif text-xl font-bold text-white">K</span>
          </div>
          <span className="font-serif text-2xl text-foreground">KILN</span>
        </div>

        {/* Progress dots */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step ? "w-8 bg-kiln-orange" : s < step ? "w-2 bg-kiln-orange/50" : "w-2 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center">
            <Sparkles className="mx-auto mb-4 h-12 w-12 text-kiln-orange" />
            <h1 className="font-serif text-3xl text-foreground">Welcome to KILN!</h1>
            <p className="mt-3 text-muted-foreground">
              Let&apos;s create your first AI agent. It only takes a minute.
            </p>
            <Button
              onClick={() => setStep(2)}
              className="mt-8 h-12 px-8 text-base"
            >
              Get Started <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <button
              onClick={skipOnboarding}
              disabled={skipping}
              className="mt-4 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              {skipping ? "Skipping..." : "Skip for now"}
            </button>
          </div>
        )}

        {/* Step 2: Choose type */}
        {step === 2 && (
          <div>
            <h2 className="text-center font-serif text-2xl text-foreground">What kind of agent?</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              You can always create more agents later.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <button
                onClick={() => { setMode("CHAT"); setStep(3); }}
                className={`group flex flex-col items-center rounded-xl border-2 p-6 transition-all hover:border-blue-500/50 hover:bg-blue-500/5 ${
                  mode === "CHAT" ? "border-blue-500 bg-blue-500/5" : "border-border"
                }`}
              >
                <Bot className="mb-3 h-10 w-10 text-blue-400" />
                <span className="text-sm font-semibold text-foreground">Chat Agent</span>
                <span className="mt-1 text-center text-xs text-muted-foreground">
                  Talks to your visitors. Embed on your website.
                </span>
              </button>
              <button
                onClick={() => { setMode("TASK"); setStep(4); }}
                className={`group flex flex-col items-center rounded-xl border-2 p-6 transition-all hover:border-kiln-orange/50 hover:bg-kiln-orange/5 ${
                  mode === "TASK" ? "border-kiln-orange bg-kiln-orange/5" : "border-border"
                }`}
              >
                <Zap className="mb-3 h-10 w-10 text-kiln-orange" />
                <span className="text-sm font-semibold text-foreground">Task Agent</span>
                <span className="mt-1 text-center text-xs text-muted-foreground">
                  Runs background tasks. Automate workflows.
                </span>
              </button>
            </div>
            <div className="mt-6 text-center">
              <button
                onClick={skipOnboarding}
                disabled={skipping}
                className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                {skipping ? "Skipping..." : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Chat Agent — pick industry or describe */}
        {step === 3 && (
          <div>
            <h2 className="text-center font-serif text-2xl text-foreground">What does your agent do?</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Pick an industry template or describe it yourself.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setSelectedIndustry(ind.id)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                    selectedIndustry === ind.id
                      ? "border-kiln-orange bg-kiln-orange/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                  }`}
                >
                  {ind.label}
                </button>
              ))}
            </div>
            {selectedIndustry === "custom" && (
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Describe what your agent should do..."
                rows={3}
                className="mt-4 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/50 focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
              />
            )}
            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={createAgent}
                disabled={creating || (!selectedIndustry && !customDescription)}
              >
                {creating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <>Create Agent <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
            <div className="mt-4 text-center">
              <button
                onClick={skipOnboarding}
                disabled={skipping || creating}
                className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                {skipping ? "Skipping..." : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Task Agent — describe */}
        {step === 4 && (
          <div>
            <h2 className="text-center font-serif text-2xl text-foreground">Describe your task</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              What should this agent do when triggered?
            </p>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="e.g., Summarize daily sales reports and email the team..."
              rows={4}
              className="mt-6 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/50 focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
            />
            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={createAgent}
                disabled={creating || !customDescription.trim()}
              >
                {creating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <>Create Agent <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
            <div className="mt-4 text-center">
              <button
                onClick={skipOnboarding}
                disabled={skipping || creating}
                className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                {skipping ? "Skipping..." : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Chat Agent created — embed code */}
        {step === 5 && createdAgent && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-green/10">
              <Check className="h-8 w-8 text-kiln-green" />
            </div>
            <h2 className="font-serif text-2xl text-foreground">
              {createdAgent.name} is live!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Embed this code on your website to start conversations:
            </p>
            <div className="mt-6 rounded-lg border border-border bg-card p-3">
              <code className="block whitespace-pre-wrap text-left text-xs text-foreground/80">
                {embedCode}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(embedCode);
                  setEmbedCopied(true);
                  setTimeout(() => setEmbedCopied(false), 2000);
                }}
                className="mt-3"
              >
                {embedCopied ? (
                  <><Check className="mr-1.5 h-3 w-3 text-kiln-green" /> Copied!</>
                ) : (
                  <><Copy className="mr-1.5 h-3 w-3" /> Copy Embed Code</>
                )}
              </Button>
            </div>
            <Button
              onClick={() => router.push("/dashboard/agents")}
              className="mt-8 h-12 px-8 text-base"
            >
              <Rocket className="mr-2 h-4 w-4" /> Go to Dashboard
            </Button>
          </div>
        )}

        {/* Step 6: Task Agent created */}
        {step === 6 && createdAgent && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-green/10">
              <Check className="h-8 w-8 text-kiln-green" />
            </div>
            <h2 className="font-serif text-2xl text-foreground">
              {createdAgent.name} is ready!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Configure triggers, output actions, and run your first task from the agent detail page.
            </p>
            <Button
              onClick={() => router.push(`/dashboard/agents/${createdAgent.id}`)}
              className="mt-8 h-12 px-8 text-base"
            >
              <Rocket className="mr-2 h-4 w-4" /> Configure Agent
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
