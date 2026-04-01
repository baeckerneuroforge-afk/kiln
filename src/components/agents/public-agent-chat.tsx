"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Bot, User, ImageIcon, X, UserCheck, Mail, MoonStar, Camera, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeCss } from "@/lib/css-sanitizer";
import { MarkdownMessage } from "./markdown-message";
import {
  type AgentScheduleConfig,
  getAgentScheduleStatus,
  normalizeAgentSchedule,
} from "@/lib/agent-scheduling";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "human" | "system";
  content: string;
  imageUrl?: string;
  createdAt: string;
}

interface PublicAgentChatProps {
  agentId: string;
  agentName: string;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  primaryColor: string;
  logoUrl?: string | null;
  avatarUrl?: string | null;
  soundEnabled?: boolean;
  showPoweredBy: boolean;
  imageAnalysisEnabled?: boolean;
  customCss?: string | null;
  schedule?: AgentScheduleConfig | Record<string, unknown> | null;
}

/**
 * Generiert eine stabile visitorId basierend auf Browser-Eigenschaften.
 * Wird in localStorage gespeichert für Wiedererkennung.
 */
function getOrCreateVisitorId(): string {
  const STORAGE_KEY = "kiln_visitor_id";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage nicht verfügbar (z.B. in iframe ohne Storage-Zugriff)
  }

  // Einfacher Fingerprint aus Browser-Eigenschaften
  const parts = [
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "0x0",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    navigator.language || "en",
    navigator.hardwareConcurrency?.toString() || "0",
    new Date().getTimezoneOffset().toString(),
  ];

  // Canvas-basierter Fingerprint (leichtgewichtig)
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#F97316";
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = "#1a1918";
      ctx.font = "6px sans-serif";
      ctx.fillText("K", 2, 12);
      parts.push(canvas.toDataURL().slice(-20));
    }
  } catch {
    // Canvas nicht verfügbar
  }

  // Einfacher Hash aus den Parts
  let hash = 0;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32-bit integer
  }
  const id = `v_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Kann nicht speichern — wird bei jedem Besuch neu generiert
  }

  return id;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_COMPRESSED_SIZE = 1024 * 1024; // 1MB nach Komprimierung
const MAX_DIMENSION = 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * Client-seitige Bildkomprimierung: Resize auf max 1024px, komprimiere auf max ~1MB.
 */
function compressImage(dataUrl: string, mediaType: string): Promise<{ dataUrl: string; mediaType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Skaliere auf max 1024px
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve({ dataUrl, mediaType }); return; }

      ctx.drawImage(img, 0, 0, width, height);

      // JPEG komprimierung mit sinkender Qualität
      const outputType = mediaType === "image/png" ? "image/png" : "image/jpeg";
      let quality = 0.85;
      let result = canvas.toDataURL(outputType, quality);

      // Falls immer noch zu groß, Qualität reduzieren
      while (result.length > MAX_COMPRESSED_SIZE * 1.37 && quality > 0.3) { // base64 ist ~37% größer
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }

      resolve({
        dataUrl: result,
        mediaType: result.startsWith("data:image/jpeg") ? "image/jpeg" : outputType,
      });
    };
    img.onerror = () => resolve({ dataUrl, mediaType });
    img.src = dataUrl;
  });
}
const RESPONSE_PING =
  "data:audio/wav;base64,UklGRuQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcADAACAmaeijnNeWGR9l6ajkHZgWGN7laWkknhhWWJ4kqSklHtjWWB2kKKlln1lWl90jqGlmH9nWl5yi5+lmYJpW15wiZ6lm4RsXF1uhpyknIZuXV1shJqknYlwX1xqgpijnotyYFxpgJajn410YVxnfZSin493Y1xme5KhoJB5ZV1leZCgoJJ7Zl1kd46eoZR9aF5jdYydoZWAal5ic4qcoZaCbF9hcYiaoZiEbmBhcIaZoJmGcGFhboSXoJqIcmJgbYKVn5qJdGRga4CUn5uLdmVgan6SnpyNeGZhaXyQnZyOemhhaHqOnJyQfGlhZ3iMm52RfmtiZnaKmp2Sf21jZnWJmJ2UgW5jZXOHl5yVg3BkZXKFlpyVhXJlZXCDlJyWhnRmZG+Bk5uXiHVnZG5/kZqXindoZW1+j5qYi3lqZWx8jpmYjHtrZWt7jJiYjnxsZWp5i5eZj35uZmp4iZaZkIBvZ2l2h5WYkYFxZ2l1hpSYkoNyaGl0hJKYkoR0aWlzg5GXk4V1amhygZCXk4d3a2hxgI6WlIh4bGlwfo2WlIl6bWlvfYyVlIp7bmlue4qUlYt9b2pueomTlYx+cWpteYeSlI1/cmtteIaRlI6Bc2ttd4WQlI6CdWxtdoOPlI+Ddm1sdYKOk5CEd25sdIGNk5CFeG9tc4CMkpCGenBtc36LkpCHe3Btcn2JkZGIfHJtcnyIkJGJfXNucXuHj5CKfnRucXqGj5CKf3VvcXmFjpCLgXZvcHiEjZCLgndwcHiDjJCMgnhxcHeBi4+Mg3lxcXaAio+MhHpycXZ/iY6NhXtzcXV/iI6Nhnx0cXV+h42Nhn11cnV9hoyNh352cnV8hYyMh392cnR7hIuMiH93c3R7g4qMiIB4c3R6g4mMiIF5dHR6gomLiYJ6dXR5gYiLiYJ7dXV5gIeLiYN7dnV5f4aKiYN8d3V4f4aKiYR9d3V4foWJiYR+eHZ4foSIiYV+eXZ4fYOIiIV/eXd4fYOHiIV/end4fIKHiIWAe3d4fIKGiIWBe3h4fIGFh4WBfHh4fICFh4WBfHl5e4CEhoWCfXp5e4CEhoWCfnp5e3+DhoWCfnt6e3+DhYWCfnt6e36ChYWCf3x6e36ChISCf3x7e36BhISCf317fH6Bg4SCgH18fH6Ag4OCgH18fH6AgoOCgH58fH6AgoOCgH59fX6AgYKCgH99fX6AgYKCgH9+fX5/gYGBgH9+fn5/gIGBgH9+fn5/gIGBgH9/fn9/gICAgH9/f39/gICAgH9/f39/gICAgIA=";

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 15) return "Just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function PublicAgentChat({
  agentId,
  agentName,
  welcomeMessage,
  suggestedQuestions,
  primaryColor,
  logoUrl,
  avatarUrl,
  soundEnabled = false,
  showPoweredBy,
  imageAnalysisEnabled = false,
  customCss,
  schedule,
}: PublicAgentChatProps) {
  const sanitizedCustomCss = customCss ? sanitizeCss(customCss) : "";
  const normalizedSchedule = useMemo(() => normalizeAgentSchedule(schedule), [schedule]);
  const [messages, setMessages] = useState<ChatMessage[]>(
    welcomeMessage
      ? [{ id: "welcome", role: "assistant", content: welcomeMessage, createdAt: new Date().toISOString() }]
      : []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [visitorId] = useState(() => getOrCreateVisitorId());
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; mediaType: string } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [hasSentImage, setHasSentImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState(() =>
    getAgentScheduleStatus(normalizedSchedule)
  );
  const [offlineName, setOfflineName] = useState("");
  const [offlineEmail, setOfflineEmail] = useState("");
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);
  const [offlineSubmitted, setOfflineSubmitted] = useState(false);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const lastHumanPollRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const updateStatus = () => setScheduleStatus(getAgentScheduleStatus(normalizedSchedule));
    updateStatus();
    const interval = window.setInterval(updateStatus, 60_000);
    return () => window.clearInterval(interval);
  }, [normalizedSchedule]);

  const isOffline = normalizedSchedule.enabled && !scheduleStatus.isOnline;

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
          createdAt: m.createdAt,
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

  function playNotificationSound() {
    if (!soundEnabled || !document.hidden) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(RESPONSE_PING);
        audioRef.current.preload = "auto";
      }
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {});
    } catch {
      // noop
    }
  }

  function renderAgentAvatar(sizeClass: string, iconClass: string) {
    if (avatarUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={agentName}
          className={cn(sizeClass, "rounded-full object-cover")}
        />
      );
    }

    return (
      <div
        className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", sizeClass)}
        style={{ backgroundColor: primaryColor }}
      >
        <span className={iconClass}>{agentName.charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  function processImageFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Only JPG, PNG, GIF, and WebP images are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      alert("Image must be under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      const compressed = await compressImage(raw, file.type);
      setPendingImage(compressed);
    };
    reader.readAsDataURL(file);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!imageAnalysisEnabled) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      processImageFile(file);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (imageAnalysisEnabled) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function sendMessage(content: string) {
    if ((!content.trim() && !pendingImage) || isStreaming || isOffline) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim() || (pendingImage ? "Analyze this image." : ""),
      imageUrl: pendingImage?.dataUrl,
      createdAt: new Date().toISOString(),
    };

    const currentImage = pendingImage;
    if (currentImage) setHasSentImage(true);
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setPendingImage(null);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() },
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
        body: JSON.stringify({ messages: apiMessages, sessionId, channel: "WEB", visitorId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData && typeof errorData.error === "string"
            ? errorData.error
            : "Chat error"
        );
      }

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
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.intentRouting) {
              const ir = parsed.intentRouting as { intent: string; confidence: number; targetAgent: string };
              setMessages((prev) => [
                ...prev,
                {
                  id: `routing-${Date.now()}`,
                  role: "system" as const,
                  content: `Weiterleitung an ${ir.targetAgent} (${ir.intent}, ${Math.round(ir.confidence * 100)}%)`,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }
            if (parsed.text) {
              fullText += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            }
            // Image Vision V1.0: extracted document data
            if (parsed.extractedDocument) {
              const doc = parsed.extractedDocument as { type: string; summary: string };
              fullText += `\n\n📄 **Extracted (${doc.type}):** ${doc.summary}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            }
            // Image Vision V1.0: auto-triggered action
            if (parsed.imageAction) {
              const act = parsed.imageAction as { action: string; reason: string; priority: string };
              const priorityLabel = act.priority === "urgent" ? "🔴 URGENT" : "🟢";
              fullText += `\n\n${priorityLabel} **Auto-Action:** ${act.action} — ${act.reason}`;
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

      if (fullText) {
        playNotificationSound();
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

  async function submitOfflineLead() {
    if (!offlineEmail.trim() || offlineSubmitting) return;

    setOfflineSubmitting(true);
    setOfflineError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offlineLead: {
            email: offlineEmail.trim(),
            name: offlineName.trim() || undefined,
          },
          sessionId,
          channel: "WEB",
          visitorId,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data && typeof data.error === "string"
            ? data.error
            : "Failed to save your details."
        );
      }

      setOfflineSubmitted(true);
      setOfflineEmail("");
      setOfflineName("");
    } catch (error) {
      setOfflineError(
        error instanceof Error ? error.message : "Failed to save your details."
      );
    } finally {
      setOfflineSubmitting(false);
    }
  }

  const showSuggestions =
    suggestedQuestions &&
    suggestedQuestions.length > 0 &&
    !isOffline &&
    messages.filter((m) => m.role === "user").length === 0;

  return (
    <div
      className="flex h-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl relative"
      style={{ borderColor: isDragging ? primaryColor : `${primaryColor}20`, backgroundColor: "#1C1917" }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag-and-Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
          <div className="flex flex-col items-center gap-2 text-white">
            <ImageIcon className="h-10 w-10" style={{ color: primaryColor }} />
            <p className="text-sm font-medium">Drop image here</p>
          </div>
        </div>
      )}
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
        {avatarUrl ? (
          renderAgentAvatar("h-10 w-10", "text-sm")
        ) : logoUrl ? (
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
              style={{ backgroundColor: isOffline ? "#F59E0B" : "#22C55E" }}
            />
            <p className="text-xs" style={{ color: "#A8A29E" }}>
              {isOffline
                ? scheduleStatus.nextOnlineText || "Offline"
                : "Online"}
            </p>
          </div>
        </div>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isOffline && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-[#FAFAF9]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                <MoonStar className="h-4 w-4 text-amber-300" />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    We&apos;re currently offline
                  </p>
                  <p className="mt-1 text-sm text-[#E7E5E4]">
                    {normalizedSchedule.offlineMessage}
                  </p>
                  {scheduleStatus.nextOnlineText && (
                    <p className="mt-2 text-xs text-amber-200">
                      {scheduleStatus.nextOnlineText}
                    </p>
                  )}
                </div>

                {normalizedSchedule.offlineAction === "collect_email" && (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-[#242220]/70 p-3">
                    {offlineSubmitted ? (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                        Thanks. Your details were saved and tagged for follow-up.
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-100/80">
                          Leave your email
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            value={offlineName}
                            onChange={(event) => setOfflineName(event.target.value)}
                            placeholder="Name (optional)"
                            className="rounded-xl border border-white/10 bg-[#292524] px-3 py-2.5 text-sm text-white placeholder:text-[#A8A29E] focus:outline-none"
                          />
                          <input
                            type="email"
                            value={offlineEmail}
                            onChange={(event) => setOfflineEmail(event.target.value)}
                            placeholder="you@example.com"
                            className="rounded-xl border border-white/10 bg-[#292524] px-3 py-2.5 text-sm text-white placeholder:text-[#A8A29E] focus:outline-none"
                          />
                        </div>
                        {offlineError && (
                          <p className="text-xs text-red-300">{offlineError}</p>
                        )}
                        <button
                          onClick={submitOfflineLead}
                          disabled={!offlineEmail.trim() || offlineSubmitting}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                          style={{ backgroundColor: primaryColor }}
                        >
                          {offlineSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                          Send details
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isOffline && messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "group flex flex-col gap-1",
              msg.role === "user" ? "items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "flex gap-2.5",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
            >
            {msg.role === "system" && (
              <div className="w-full flex justify-center">
                <span className="text-[10px] text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-full px-3 py-1">
                  {msg.content}
                </span>
              </div>
            )}
            {msg.role === "assistant" && (
              <div className="mt-0.5 shrink-0">
                {renderAgentAvatar("h-7 w-7", "text-xs")}
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
            {msg.role !== "system" && (
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
              {/* Image Thumbnail — klickbar für Lightbox */}
              {msg.imageUrl && !msg.imageUrl.includes("kiln-meta") && (
                <button
                  className="mb-2 group relative block"
                  onClick={() => setLightboxImage(msg.imageUrl!)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.imageUrl}
                    alt="Uploaded"
                    className="max-h-32 max-w-full rounded-lg object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 group-hover:bg-black/30 transition-colors">
                    <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              )}
              {msg.content ? (
                <MarkdownMessage content={msg.content} />
              ) : (
                <span className="inline-flex items-center gap-1.5 py-1">
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#A8A29E]" />
                  <span
                    className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#A8A29E]"
                    style={{ animationDelay: "120ms" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#A8A29E]"
                    style={{ animationDelay: "240ms" }}
                  />
                </span>
              )}
            </div>
            )}
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 bg-[#292524]">
                <User className="h-4 w-4" style={{ color: "#A8A29E" }} />
              </div>
            )}
          </div>
            {msg.role !== "system" && (
            <div
              className={cn(
                "px-10 text-[10px] text-[#78716C] opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                msg.role === "user" ? "text-right" : "text-left"
              )}
            >
              {formatRelativeTime(msg.createdAt)}
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
          <div className="flex items-end gap-2">
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
            <p className="text-[10px] text-amber-400/70 pb-1">
              Image messages use ~3-5x more AI credits
            </p>
          </div>
        </div>
      )}

      {/* Follow-up photo prompt */}
      {hasSentImage && !pendingImage && imageAnalysisEnabled && !isStreaming && (
        <div className="border-t px-4 py-2" style={{ borderColor: "#292524" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            📷 Want to share an updated photo?
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4" style={{ borderColor: "#292524" }}>
        {!isOffline ? (
          <div className="flex items-center gap-2">
          {imageAnalysisEnabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                capture="environment"
                className="hidden"
                onChange={handleImageSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40"
                style={{ backgroundColor: "#292524", color: "#A8A29E" }}
                title="Upload image or take photo"
              >
                <Camera className="h-4 w-4 sm:hidden" />
                <ImageIcon className="h-4 w-4 hidden sm:block" />
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
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#242220] px-4 py-3 text-sm text-[#D6D3D1]">
            {normalizedSchedule.offlineAction === "hide_widget"
              ? "This agent is outside business hours."
              : "Chat is currently paused outside business hours."}
          </div>
        )}
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

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImage}
            alt="Full view"
            className="max-h-[90%] max-w-[90%] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
