"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BuilderChat } from "@/components/agents/builder-chat";
import { AgentPreview } from "@/components/agents/agent-preview";
import type { GeneratedAgentConfig } from "@/types/agent";

export default function NewAgentPage() {
  const router = useRouter();
  const [config, setConfig] = useState<GeneratedAgentConfig | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfigGenerated(newConfig: GeneratedAgentConfig) {
    setConfig(newConfig);
    setStreamingText("");
  }

  function handleStreamingUpdate(text: string) {
    setStreamingText(text);
  }

  async function handleSave() {
    if (!config) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          slug: config.slug,
          description: config.personality?.tone || "",
          systemPrompt: config.system_prompt,
          personality: config.personality,
          welcomeMessage: config.welcome_message,
          suggestedQuestions: config.suggested_questions,
          suggestedActions: config.suggested_actions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }

      const agent = await res.json();
      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setIsSaving(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/agents"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {config?.name || "Neuer Agent"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {config ? "Konfiguration generiert" : "Beschreibe deinen Agent"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {config && (
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Agent speichern
            </Button>
          )}
        </div>
      </div>

      {/* Split-Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Links: Chat-Interface */}
        <div className="w-1/2 border-r border-border overflow-hidden">
          <BuilderChat
            onConfigGenerated={handleConfigGenerated}
            onStreamingUpdate={handleStreamingUpdate}
          />
        </div>

        {/* Rechts: Live-Vorschau */}
        <div className="w-1/2 bg-background/50 overflow-hidden">
          <AgentPreview config={config} streamingText={streamingText} />
        </div>
      </div>
    </div>
  );
}
