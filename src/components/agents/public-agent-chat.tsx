"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, User, ImageIcon, X, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeCss } from "@/lib/css-sanitizer";
import { MarkdownMessage } from "./markdown-message";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "human";
  content: string;
  imageUrl?: string;
}

interface PublicAgentChatProps {
  agentId: string;
  agentName: string;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  primaryColor: string;
  logoUrl?: string | null;
  showPoweredBy: boolean;
  imageAnalysisEnabled?: boolean;
  customCss?: string | null;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function PublicAgentChat({
  agentId,
  agentName,
  welcomeMessage,
  suggestedQuestions,
  primaryColor,
  logoUrl,
  showPoweredBy,
  imageAnalysisEnabled = false,
  customCss,
}: PublicAgentChatProps) {
  const sanitizedCustomCss = customCss ? sanitizeCss(customCss) : "";
  const [messages, setMessages] = useState<ChatMessage[]>(
    welcomeMessage
      ? [{ id: "welcome", role: "assistant", content: welcomeMessage }]
      : []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; mediaType: string } | null>(null);
  const lastHumanPollRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for human replies when handoff is active
  const pollForHumanReplies = useCallback(async () => {
    try {
      const url = new URL(`/api/agents/${agentId}/chat/poll`, window.location.origin);
      url.searchParams.set("sessionId", sessionId);
      if (lastHumanPollRef.current) {
        url.searchParams.set("after", lastHumanPollRef.current);
      }
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const newMsgs: ChatMessage[] = data.messages.map((m: { id: string; content: string; createdAt: string }) => ({
          id: m.id,
          role: "human" as const,
          content: m.content,
        }));
        setMessages((prev) => {
          // Deduplicate
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = newMsgs.filter((m: ChatMessage) => !existingIds.has(m.id));
          return unique.length > 0 ? [...prev, ...unique] : prev;
        });
        const lastMsg = data.messages[data.messages.length - 1];
        lastHumanPollRef.current = lastMsg.createdAt;
      }
    } catch {
      // Polling failure is silent
    }
  }, [agentId, sessionId]);

  useEffect(() => {
    // Start polling after first message exchange
    if (messages.filter((m) => m.role === "user").length === 0) return;
    const interval = setInterval(pollForHumanReplies, 5000);
    return () => clearInterval(interval);
  }, [messages, pollForHumanReplies]);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Only JPG, PNG, GIF, and WebP images are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      alert("Image must be under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage({ dataUrl: reader.result as string, mediaType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function sendMessage(content: string) {
    if ((!content.trim() && !pendingImage) || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim() || (pendingImage ? "Analyze this image." : ""),
      imageUrl: pendingImage?.dataUrl,
    };

    const currentImage = pendingImage;
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setPendingImage(null);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const apiMessages = updated
        .filter((m) => m.id !== "welcome")
        .map((m) => {
          if (m.imageUrl && m === userMsg && currentImage) {
            const base64Data = currentImage.dataUrl.split(",")[1];
            return {
              role: m.role,
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: currentImage.mediaType,
                    data: base64Data,
                  },
                },
                { type: "text", text: m.content },
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, sessionId, channel: "WEB" }),
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
            ? { ...m, content: "Sorry, an error occurred. Please try again." }
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
      {/* White-label custom CSS */}
      {sanitizedCustomCss && <style dangerouslySetInnerHTML={{ __html: sanitizedCustomCss }} />}

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
            {msg.role === "human" && (
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5"
                style={{ backgroundColor: "#22C55E20" }}
              >
                <UserCheck className="h-4 w-4" style={{ color: "#22C55E" }} />
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
                  msg.role === "user" ? primaryColor :
                  msg.role === "human" ? "#14532d" :
                  "#292524",
              }}
            >
              {/* Image Thumbnail */}
              {msg.imageUrl && (
                <div className="mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.imageUrl}
                    alt="Uploaded"
                    className="max-h-32 max-w-full rounded-lg object-contain"
                  />
                </div>
              )}
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

      {/* Pending Image Preview */}
      {pendingImage && (
        <div className="border-t px-4 pt-2" style={{ borderColor: "#292524" }}>
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage.dataUrl}
              alt="Pending upload"
              className="h-16 rounded-lg object-contain"
              style={{ border: "1px solid #3C3836" }}
            />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4" style={{ borderColor: "#292524" }}>
        <div className="flex items-center gap-2">
          {imageAnalysisEnabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleImageSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40"
                style={{ backgroundColor: "#292524", color: "#A8A29E" }}
              >
                <ImageIcon className="h-4 w-4" />
              </button>
            </>
          )}
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
            placeholder={pendingImage ? "Describe what to analyze..." : "Type a message..."}
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
            disabled={(!input.trim() && !pendingImage) || isStreaming}
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
