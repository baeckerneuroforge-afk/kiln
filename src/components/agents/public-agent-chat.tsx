"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "./markdown-message";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface PublicAgentChatProps {
  agentId: string;
  agentName: string;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  primaryColor: string;
  logoUrl?: string | null;
  showPoweredBy: boolean;
}

export function PublicAgentChat({
  agentId,
  agentName,
  welcomeMessage,
  suggestedQuestions,
  primaryColor,
  logoUrl,
  showPoweredBy,
}: PublicAgentChatProps) {
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
      const apiMessages = updated
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
        for (const line of chunk.split("\n")) {
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
            // Skip
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Entschuldigung, es ist ein Fehler aufgetreten. Bitte versuche es erneut." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  const showSuggestions =
    suggestedQuestions &&
    suggestedQuestions.length > 0 &&
    messages.filter((m) => m.role === "user").length === 0;

  return (
    <div
      className="flex h-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      style={{ borderColor: `${primaryColor}20`, backgroundColor: "#1C1917" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}15, transparent)`,
          borderBottom: `1px solid ${primaryColor}15`,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={agentName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            <Bot className="h-5 w-5" style={{ color: primaryColor }} />
          </div>
        )}
        <div>
          <p className="font-semibold text-white">{agentName}</p>
          <div className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "#22C55E" }}
            />
            <p className="text-xs" style={{ color: "#A8A29E" }}>
              Online
            </p>
          </div>
        </div>
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
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <Bot className="h-4 w-4" style={{ color: primaryColor }} />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-br-md text-white"
                  : "rounded-bl-md text-[#FAFAF9]"
              )}
              style={{
                backgroundColor:
                  msg.role === "user" ? primaryColor : "#292524",
              }}
            >
              {msg.content ? (
                <MarkdownMessage content={msg.content} />
              ) : (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "#A8A29E" }}
                />
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 bg-[#292524]">
                <User className="h-4 w-4" style={{ color: "#A8A29E" }} />
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
                className="block w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all hover:border-opacity-50"
                style={{
                  borderColor: `${primaryColor}20`,
                  backgroundColor: "#292524",
                  color: "#FAFAF9",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.borderColor = `${primaryColor}50`;
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.borderColor = `${primaryColor}20`;
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4" style={{ borderColor: "#292524" }}>
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
            disabled={isStreaming}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-[#A8A29E] focus:outline-none focus:ring-1"
            style={{
              backgroundColor: "#292524",
              borderColor: "#3C3836",
              // @ts-expect-error CSS custom property
              "--tw-ring-color": primaryColor,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {showPoweredBy && (
          <p className="mt-2 text-center text-[10px]" style={{ color: "#78716C" }}>
            Powered by{" "}
            <a
              href="https://getkiln.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "#A8A29E" }}
            >
              KILN
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
