"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BuilderMessage, GeneratedAgentConfig } from "@/types/agent";

interface BuilderChatProps {
  onConfigGenerated: (config: GeneratedAgentConfig) => void;
  onStreamingUpdate: (text: string) => void;
}

// JSON aus Claude's Antwort extrahieren
function extractJsonFromResponse(text: string): GeneratedAgentConfig | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1].trim());
  } catch {
    return null;
  }
}

export function BuilderChat({
  onConfigGenerated,
  onStreamingUpdate,
}: BuilderChatProps) {
  const [messages, setMessages] = useState<BuilderMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        'What should your agent do? Describe it as you would explain it to a colleague.\n\nFor example: *"I\'m a yoga instructor in Munich. My bot should give course recommendations, handle bookings, and answer our FAQ."*',
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll bei neuen Nachrichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: BuilderMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    // Streaming-Nachricht vorbereiten
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      // API-Nachrichten vorbereiten (ohne welcome + ohne IDs)
      const apiMessages = updatedMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/ai/generate-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        throw new Error("API error");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream available");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { throw new Error(parsed.error); }
            if (parsed.text) {
              fullText += parsed.text;
              // Streaming-Update an die Vorschau
              onStreamingUpdate(fullText);
              // Nachricht aktualisieren
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            }
          } catch {
            // Ignoriere parse-Fehler bei unvollständigen Chunks
          }
        }
      }

      // Config aus der fertigen Antwort extrahieren
      const config = extractJsonFromResponse(fullText);
      if (config) {
        onConfigGenerated(config);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, agentConfig: config } : m
          )
        );
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `Error generating agent: ${errorMsg}. Please try again.`,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Describe Agent
        </h2>
        <p className="text-xs text-muted-foreground">
          Describe your agent — KILN generates the configuration.
        </p>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {message.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground border border-border"
              )}
            >
              {/* Einfaches Markdown-Rendering für Kursiv */}
              {message.content.split("\n").map((line, i) => (
                <p key={i} className={i > 0 ? "mt-2" : ""}>
                  {line.split(/(\*[^*]+\*)/).map((part, j) =>
                    part.startsWith("*") && part.endsWith("*") ? (
                      <em key={j} className="text-muted-foreground">
                        {part.slice(1, -1)}
                      </em>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              ))}

              {/* Config-Badge wenn Agent generiert */}
              {message.agentConfig && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-kiln-orange/10 px-3 py-2 text-xs text-kiln-orange">
                  <Bot className="h-3.5 w-3.5" />
                  Agent config generated: {message.agentConfig.name}
                </div>
              )}
            </div>
            {message.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {isStreaming && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            KILN is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe your agent..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
