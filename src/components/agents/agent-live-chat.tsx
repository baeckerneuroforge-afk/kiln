"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Database,
  Wrench,
  FileText,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "./markdown-message";

interface DebugInfo {
  ragChunks: { content: string; similarity: number }[];
  toolsEvaluated: string[];
  toolCalls: { name: string; input: Record<string, unknown>; result: string }[];
  systemPrompt: string;
  systemPromptLength: number;
  tokens: { input: number; output: number; total: number };
  model: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  debug?: DebugInfo;
}

interface AgentLiveChatProps {
  agentId: string;
  agentName: string;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  debugMode?: boolean;
}

export function AgentLiveChat({
  agentId,
  agentName,
  welcomeMessage,
  suggestedQuestions,
  debugMode = false,
}: AgentLiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    welcomeMessage
      ? [{ id: "welcome", role: "assistant", content: welcomeMessage }]
      : []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [expandedDebug, setExpandedDebug] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function toggleDebug(id: string) {
    setExpandedDebug((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      const apiMessages = updatedMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          sessionId,
          channel: "WEB",
          debug: debugMode,
        }),
      });

      if (!res.ok) throw new Error("Chat error");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

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
            // Debug-Info empfangen
            if (parsed.debug) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, debug: parsed.debug } : m
                )
              );
              // Auto-expand debug bei Empfang
              if (debugMode) {
                setExpandedDebug((prev) => new Set(prev).add(assistantId));
              }
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
            ? { ...m, content: "Error generating response. Please try again." }
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
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kiln-orange/10">
          <Bot className="h-4 w-4 text-kiln-orange" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{agentName}</p>
          <p className="text-xs text-muted-foreground">
            {debugMode ? "Debug Mode" : "Test Chat"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {debugMode && (
            <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-500">
              DEBUG
            </span>
          )}
          <div className="h-2 w-2 rounded-full bg-kiln-green" />
        </div>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div
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

            {/* Debug Panel — collapsible under assistant messages */}
            {debugMode && msg.role === "assistant" && msg.debug && (
              <div className="ml-8 mt-1">
                <button
                  onClick={() => toggleDebug(msg.id)}
                  className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {expandedDebug.has(msg.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Debug Info — {msg.debug.tokens.total} tokens
                </button>

                {expandedDebug.has(msg.id) && (
                  <div className="mt-1.5 space-y-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-[11px]">
                    {/* Model & Tokens */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Cpu className="h-3 w-3" />
                        <span>{msg.debug.model}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {msg.debug.tokens.input}in / {msg.debug.tokens.output}out = <span className="text-purple-400 font-medium">{msg.debug.tokens.total}</span> tokens
                      </div>
                    </div>

                    {/* RAG Chunks */}
                    <div>
                      <div className="flex items-center gap-1 mb-1 font-medium text-foreground">
                        <Database className="h-3 w-3 text-blue-400" />
                        KB Chunks ({msg.debug.ragChunks.length})
                      </div>
                      {msg.debug.ragChunks.length > 0 ? (
                        <div className="space-y-1">
                          {msg.debug.ragChunks.map((chunk, i) => (
                            <div key={i} className="rounded bg-background/50 px-2 py-1">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-muted-foreground">Chunk {i + 1}</span>
                                <span className={cn(
                                  "font-mono text-[10px]",
                                  chunk.similarity >= 0.85 ? "text-kiln-green" : chunk.similarity >= 0.75 ? "text-yellow-500" : "text-red-400"
                                )}>
                                  {(chunk.similarity * 100).toFixed(1)}%
                                </span>
                              </div>
                              <p className="text-muted-foreground break-words">{chunk.content}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground/60 italic">No chunks matched</p>
                      )}
                    </div>

                    {/* Tools Evaluated */}
                    <div>
                      <div className="flex items-center gap-1 mb-1 font-medium text-foreground">
                        <Wrench className="h-3 w-3 text-kiln-orange" />
                        Tools Available ({msg.debug.toolsEvaluated.length})
                      </div>
                      {msg.debug.toolsEvaluated.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {msg.debug.toolsEvaluated.map((tool) => (
                            <span key={tool} className="rounded bg-kiln-orange/10 px-1.5 py-0.5 text-[10px] text-kiln-orange">
                              {tool}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground/60 italic">No tools configured</p>
                      )}
                    </div>

                    {/* Tool Calls */}
                    {msg.debug.toolCalls.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1 mb-1 font-medium text-kiln-green">
                          <Wrench className="h-3 w-3" />
                          Tool Calls ({msg.debug.toolCalls.length})
                        </div>
                        {msg.debug.toolCalls.map((tc, i) => (
                          <div key={i} className="rounded bg-background/50 px-2 py-1 mb-1">
                            <span className="font-medium text-foreground">{tc.name}</span>
                            <pre className="mt-0.5 text-[10px] text-muted-foreground overflow-x-auto">
                              {JSON.stringify(tc.input, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* System Prompt Preview */}
                    <div>
                      <div className="flex items-center gap-1 mb-1 font-medium text-foreground">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        System Prompt ({msg.debug.systemPromptLength} chars)
                      </div>
                      <pre className="max-h-20 overflow-y-auto rounded bg-background/50 px-2 py-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-words">
                        {msg.debug.systemPrompt}
                      </pre>
                    </div>
                  </div>
                )}
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
            placeholder="Type a message..."
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
