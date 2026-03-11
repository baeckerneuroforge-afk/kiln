"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { agentTemplates, AgentTemplate } from "@/lib/agent-templates";

export default function TemplatesPage() {
  const router = useRouter();
  const [cloning, setCloning] = useState<string | null>(null);

  async function handleClone(template: AgentTemplate) {
    setCloning(template.id);

    try {
      const slug =
        template.id + "-" + Date.now().toString(36).slice(-4);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          slug,
          description: template.description,
          systemPrompt: template.systemPrompt,
          personality: template.personality,
          welcomeMessage: template.welcomeMessage,
          suggestedQuestions: template.suggestedQuestions,
          suggestedActions: template.suggestedActions,
        }),
      });

      if (!res.ok) throw new Error("Error creating agent");

      const agent = await res.json();
      router.push(`/dashboard/agents/${agent.id}`);
    } catch {
      setCloning(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/dashboard/agents"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
            <Sparkles className="h-5 w-5 text-kiln-orange" />
          </div>
          <div>
            <h1 className="font-serif text-3xl text-foreground">
              Agent Templates
            </h1>
            <p className="text-sm text-muted-foreground">
              Start with a ready-made template and customize it for your
              business.
            </p>
          </div>
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {agentTemplates.map((template) => (
          <div
            key={template.id}
            className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-lg"
          >
            {/* Icon + Branche */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-2xl">
                {template.icon}
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                {template.branche}
              </span>
            </div>

            {/* Name + Description */}
            <h3 className="mb-1.5 font-semibold text-foreground">
              {template.name}
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              {template.description}
            </p>

            {/* Suggested Questions Preview */}
            <div className="mb-4 flex-1 space-y-1.5">
              {template.suggestedQuestions.slice(0, 3).map((q, i) => (
                <div
                  key={i}
                  className="truncate rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground"
                >
                  {q}
                </div>
              ))}
            </div>

            {/* Actions Tags */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {template.suggestedActions.map((action) => {
                const labels: Record<string, string> = {
                  booking: "Appointment Booking",
                  email: "Collect Email",
                  lead_scoring: "Lead-Scoring",
                  notification: "Notification",
                };
                return (
                  <span
                    key={action}
                    className="rounded-md bg-kiln-orange/10 px-2 py-0.5 text-[10px] font-medium text-kiln-orange"
                  >
                    {labels[action] || action}
                  </span>
                );
              })}
            </div>

            {/* Clone Button */}
            <Button
              onClick={() => handleClone(template)}
              disabled={cloning === template.id}
              className="w-full"
              size="sm"
            >
              {cloning === template.id ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Use Template
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
