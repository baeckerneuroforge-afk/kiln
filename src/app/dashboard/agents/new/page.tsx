"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BuilderChat } from "@/components/agents/builder-chat";
import { AgentPreview } from "@/components/agents/agent-preview";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import type { GeneratedAgentConfig } from "@/types/agent";

export default function NewAgentPage() {
  const router = useRouter();
  const { advancedMode } = useAdvancedMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        throw new Error(data.error || "Error saving");
      }

      const agent = await res.json();
      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsSaving(false);
    }
  }

  async function handleImportConfig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsSaving(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate required fields
      if (!data.name || !data.systemPrompt) {
        throw new Error("Invalid config: name and systemPrompt are required");
      }

      const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

      // Map action types to suggested actions format
      const actionTypeMap: Record<string, string> = {
        BOOK_APPOINTMENT: "booking",
        COLLECT_EMAIL: "email",
        SCORE_LEAD: "lead_scoring",
        SEND_EMAIL: "send_email",
        NOTIFY_OWNER: "notification",
        FIRE_WEBHOOK: "webhook",
        HANDOFF_HUMAN: "handoff",
      };
      const suggestedActions = (data.actions || [])
        .filter((a: { enabled: boolean }) => a.enabled)
        .map((a: { type: string }) => actionTypeMap[a.type])
        .filter(Boolean);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
          description: data.description || "",
          systemPrompt: data.systemPrompt,
          personality: data.personality || {},
          welcomeMessage: data.welcomeMessage || "",
          suggestedQuestions: data.suggestedQuestions || [],
          suggestedActions,
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Error creating agent");
      }

      const agent = await res.json();

      // If the imported config has additional fields, update them
      const updateFields: Record<string, unknown> = {};
      if (data.memoryEnabled) updateFields.memoryEnabled = true;
      if (data.imageAnalysisEnabled) updateFields.imageAnalysisEnabled = true;
      if (data.showAiDisclaimer === false) updateFields.showAiDisclaimer = false;
      if (data.llmModel) updateFields.llmModel = data.llmModel;
      if (data.whiteLabel) updateFields.whiteLabel = data.whiteLabel;
      if (data.promptBranches) updateFields.promptBranches = data.promptBranches;
      if (data.agentType === "INTERNAL") updateFields.agentType = "INTERNAL";

      if (Object.keys(updateFields).length > 0) {
        await fetch(`/api/agents/${agent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateFields),
        });
      }

      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON file");
      setIsSaving(false);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
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
              {config?.name || "New Agent"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {config ? "Configuration Generated" : "Describe your Agent"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {advancedMode && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportConfig}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
              >
                <Upload className="mr-2 h-3.5 w-3.5" />
                Import Config
              </Button>
            </>
          )}
          {config && (
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Save Agent
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
