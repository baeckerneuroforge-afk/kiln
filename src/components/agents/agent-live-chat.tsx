"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "./markdown-message";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AgentLiveChatProps {
  agentId: string;
  agentName: string;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
}

export function AgentLiveChat({
  agentId,
  agentName,
  welcomeMessage,
  suggestedQuestions,
}: AgentLiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    welcomeMessage
      ? [{ id: "welcome", role: "assistant", content: welcomeMessage }]
      : []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      // API-Nachrichten: Nur user/assistant, kein welcome
      const apiMessages = updatedMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
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
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            }
          } catch {
            // Unvollständiger Chunk
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Fehler bei der Antwort. Bitte versuche es erneut." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  // Prüfe ob Suggested Questions angezeigt werden sollen
  const showSuggestions =
    suggestedQuestions &&
    suggestedQuestions.length > 0 &&
    messages.filter((m) => m.role === "user").length === 0;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kiln-orange/10">
          <Bot className="h-4 w-4 text-kiln-orange" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{agentName}</p>
          <p className="text-xs text-muted-foreground">Test-Chat</p>
        </div>
        <div className="ml-auto h-2 w-2 rounded-full bg-kiln-green" />
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2.5",
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
                "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-muted/50 text-foreground"
              )}
            >
              {msg.content ? (
                <MarkdownMessage content={msg.content} />
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </span>
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
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted hover:border-primary/20"
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Nachricht eingeben..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
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
      </div>
    </div>
  );
}
