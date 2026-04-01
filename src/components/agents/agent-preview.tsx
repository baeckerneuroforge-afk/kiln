"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, MessageSquare, Sparkles, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeneratedAgentConfig } from "@/types/agent";

interface AgentPreviewProps {
  config: GeneratedAgentConfig | null;
  streamingText: string;
}

interface PreviewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AgentPreview({ config, streamingText }: AgentPreviewProps) {
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset bei neuer Config
  useEffect(() => {
    setMessages([]);
  }, [config?.name]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // No config yet → Placeholder
  if (!config && !streamingText) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-8">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Live Preview
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Describe your agent in the chat on the left. The preview shows you in real-time how your agent will look and respond.
        </p>
      </div>
    );
  }

  // Streaming läuft, aber noch keine fertige Config
  if (!config && streamingText) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse text-kiln-orange" />
            <span className="text-sm font-medium text-foreground">
              Generating agent...
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <pre className="whitespace-pre-wrap font-sans">{streamingText}</pre>
          </div>
        </div>
      </div>
    );
  }

  // Live-Chat mit Claude API über den System-Prompt
  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming || !config) return;

    const userMsg: PreviewMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      // Direkt Claude API über generate-agent Route mit dem System-Prompt
      const apiMessages = updated.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Nutze generate-agent Route mit Custom System Prompt
      const res = await fetch("/api/ai/generate-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `[SYSTEM CONTEXT: You are now the agent "${config.name}". Respond ONLY as this agent, based on the following system prompt. Do NOT generate JSON. Simply respond as the agent.\n\nSystem Prompt: ${config.system_prompt}\n\nWelcome Message: ${config.welcome_message}]\n\nThe following message is from the visitor:`,
            },
            ...apiMessages,
          ],
        }),
      });

      if (!res.ok) throw new Error("Chat-Fehler");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Kein Stream");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { throw new Error(parsed.error); }
            if (parsed.text) {
              fullText += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            }
          } catch {
            // Skip
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Preview error. Please try again." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  // Nachrichten inkl. Welcome
  const allMessages: PreviewMessage[] = [
    ...(config?.welcome_message
      ? [{ id: "welcome", role: "assistant" as const, content: config.welcome_message }]
      : []),
    ...messages,
  ];

  const showSuggestions =
    config?.suggested_questions &&
    config.suggested_questions.length > 0 &&
    messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Widget Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-kiln-orange/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-kiln-orange/10">
          <Bot className="h-5 w-5 text-kiln-orange" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {config?.name || "Agent"}
          </p>
          <p className="text-xs text-muted-foreground">
            {config?.personality?.tone || "Online"}
          </p>
        </div>
        <div className="ml-auto h-2.5 w-2.5 rounded-full bg-kiln-green" />
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {allMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kiln-orange/10 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-kiln-orange" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-card text-foreground border border-border"
              )}
            >
              {msg.content || (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Suggested Questions */}
        {showSuggestions && (
          <div className="space-y-1.5 pt-2">
            <p className="text-xs text-muted-foreground">Suggested Questions:</p>
            {config!.suggested_questions.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                className="block w-full rounded-lg border border-border bg-card/50 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card hover:border-primary/30"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
          Powered by KILN
        </p>
      </div>
    </div>
  );
}
