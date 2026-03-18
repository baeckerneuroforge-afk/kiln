"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Eye,
  Loader2,
  Send,
  Trash2,
  Clock,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PreviewMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  responseTime?: number;
};

interface PreviewConfig {
  name: string;
  systemPrompt: string;
  model: string;
  modelProvider: string;
  temperature: number;
}

interface LivePreviewPanelProps {
  agentId: string;
  config: PreviewConfig;
}

const STORAGE_KEY = "kiln_preview_open";

export function LivePreviewPanel({ agentId, config }: LivePreviewPanelProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(STORAGE_KEY) !== "false";
  });
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: PreviewMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantMsg: PreviewMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const startTime = performance.now();

    try {
      // Build messages array for the API (full conversation history)
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`/api/agents/${agentId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          config: {
            name: config.name,
            systemPrompt: config.systemPrompt,
            model: config.model,
            modelProvider: config.modelProvider,
            temperature: config.temperature,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Preview failed" }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${err.error || "Preview failed"}` }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const data = JSON.parse(payload);
            if (data.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: `Error: ${data.error}` }
                    : m
                )
              );
            } else if (data.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + data.text }
                    : m
                )
              );
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, responseTime: elapsed } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: "Error: Network request failed" }
            : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, agentId, config]);

  // Collapsed toggle button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-card/90 px-4 py-3 text-sm font-medium text-foreground shadow-xl backdrop-blur-sm transition-all hover:bg-card hover:border-kiln-orange/30 lg:static lg:mb-0"
      >
        <Eye className="h-4 w-4 text-kiln-orange" />
        <span className="hidden lg:inline">Live Preview</span>
        <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <>
      {/* Desktop: inline side panel */}
      <div className="hidden lg:block">
        <div className="sticky top-6">
          <div className={cn(
            "overflow-hidden rounded-2xl border border-white/[0.08] bg-card/60 transition-all",
            isMinimized ? "h-[52px]" : "h-[600px] flex flex-col"
          )}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-kiln-orange" />
                <span className="text-sm font-semibold text-foreground">Live Preview</span>
                <span className="rounded-full border border-kiln-orange/20 bg-kiln-orange/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-kiln-orange">
                  Unsaved
                </span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && !isMinimized && (
                  <button
                    onClick={() => setMessages([])}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                    title="Clear chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                  title={isMinimized ? "Maximize" : "Minimize"}
                >
                  {isMinimized ? (
                    <Maximize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Minimize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                  title="Close preview"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Eye className="mb-3 h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-foreground/60">
                        Test your unsaved changes
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Send a message to preview how your agent responds with the current config.
                      </p>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                          msg.role === "user"
                            ? "bg-kiln-orange text-white"
                            : "bg-white/[0.06] text-foreground"
                        )}
                      >
                        {msg.role === "assistant" && !msg.content && streaming ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Thinking...</span>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                        )}
                        {msg.role === "assistant" && msg.responseTime && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-2.5 w-2.5" />
                            {msg.responseTime < 1000
                              ? `${msg.responseTime}ms`
                              : `${(msg.responseTime / 1000).toFixed(1)}s`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input */}
                <div className="border-t border-white/[0.08] px-3 py-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendMessage();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Try it..."
                      disabled={streaming}
                      className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/40 focus:outline-none focus:ring-1 focus:ring-kiln-orange/20 disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!input.trim() || streaming}
                      className="h-[38px] w-[38px] rounded-xl bg-kiln-orange p-0 hover:bg-kiln-orange/90"
                    >
                      {streaming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="lg:hidden">
        {/* Floating trigger */}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-xl border border-kiln-orange/30 bg-kiln-orange px-4 py-3 text-sm font-medium text-white shadow-xl"
        >
          <Eye className="h-4 w-4" />
          Preview
        </button>

        {/* Bottom sheet */}
        {!isMinimized && (
          <div className="fixed inset-0 z-50 flex flex-col">
            <div
              className="flex-1 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsMinimized(true)}
            />
            <div className="h-[70vh] rounded-t-2xl border-t border-white/[0.08] bg-[#1C1917] flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Sheet header */}
              <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-kiln-orange" />
                  <span className="text-sm font-semibold text-foreground">Live Preview</span>
                  <span className="rounded-full border border-kiln-orange/20 bg-kiln-orange/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-kiln-orange">
                    Unsaved
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Eye className="mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-foreground/60">
                      Test your unsaved changes
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Send a message to preview how your agent responds with the current config.
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                        msg.role === "user"
                          ? "bg-kiln-orange text-white"
                          : "bg-white/[0.06] text-foreground"
                      )}
                    >
                      {msg.role === "assistant" && !msg.content && streaming ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Thinking...</span>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                      )}
                      {msg.role === "assistant" && msg.responseTime && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {msg.responseTime < 1000
                            ? `${msg.responseTime}ms`
                            : `${(msg.responseTime / 1000).toFixed(1)}s`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="border-t border-white/[0.08] px-4 py-3 pb-safe">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Try it..."
                    disabled={streaming}
                    className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/40 focus:outline-none focus:ring-1 focus:ring-kiln-orange/20 disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!input.trim() || streaming}
                    className="h-[38px] w-[38px] rounded-xl bg-kiln-orange p-0 hover:bg-kiln-orange/90"
                  >
                    {streaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
