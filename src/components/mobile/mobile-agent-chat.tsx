"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Loader2,
  Bot,
  Mic,
  MicOff,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  status: string;
  slug: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MobileAgentChatProps {
  agents: Agent[];
  initialAgentIndex?: number;
  onBack?: () => void;
}

const QUICK_ACTIONS = [
  "Status Report",
  "Start Workflow",
  "Check ROI",
  "Letzte Leads",
];

// ── Main Component ───────────────────────────────────────────

export function MobileAgentChat({
  agents,
  initialAgentIndex = 0,
  onBack,
}: MobileAgentChatProps) {
  const [agentIndex, setAgentIndex] = useState(initialAgentIndex);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agent = agents[agentIndex];

  // Online status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset messages on agent switch
  useEffect(() => {
    setMessages([]);
  }, [agentIndex]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !agent || sending) return;

      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: text.trim(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);

      try {
        const res = await fetch(`/api/v1/agents/${agent.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            sessionId: `mobile_${agent.id}`,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const assistantMsg: ChatMessage = {
            id: `a_${Date.now()}`,
            role: "assistant",
            content: data.response || data.content || "...",
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch {
        // offline or error
      } finally {
        setSending(false);
      }
    },
    [agent, sending]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Voice input using Web Speech API
  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "de-DE";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        setInput(transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
  };

  const swipeAgent = (direction: "left" | "right") => {
    if (direction === "left" && agentIndex < agents.length - 1) {
      setAgentIndex(agentIndex + 1);
    } else if (direction === "right" && agentIndex > 0) {
      setAgentIndex(agentIndex - 1);
    }
  };

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Kein Agent verfügbar
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 safe-top">
        {onBack && (
          <button onClick={onBack} className="p-1 text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {/* Agent swipe navigation */}
        <button
          onClick={() => swipeAgent("right")}
          disabled={agentIndex === 0}
          className="p-1 text-muted-foreground disabled:opacity-20"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{agent.name}</div>
            <div className="flex items-center gap-1">
              {isOnline ? (
                <Wifi className="h-2.5 w-2.5 text-kiln-green" />
              ) : (
                <WifiOff className="h-2.5 w-2.5 text-red-400" />
              )}
              <span className="text-[10px] text-muted-foreground">
                {isOnline ? "Verbunden" : "Offline"}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => swipeAgent("left")}
          disabled={agentIndex >= agents.length - 1}
          className="p-1 text-muted-foreground disabled:opacity-20"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Agent count indicator */}
        <span className="text-[10px] text-muted-foreground">
          {agentIndex + 1}/{agents.length}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Starte eine Unterhaltung mit {agent.name}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
              msg.role === "user"
                ? "ml-auto bg-kiln-orange text-white rounded-br-sm"
                : "mr-auto bg-card border border-border text-foreground rounded-bl-sm"
            )}
          >
            {msg.content}
          </div>
        ))}

        {sending && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-card border border-border px-4 py-3 text-sm text-muted-foreground rounded-bl-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Denkt nach...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Pills */}
      {messages.length === 0 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto no-scrollbar">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => sendMessage(action)}
              className="flex-shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground active:bg-muted transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 safe-bottom"
      >
        <div className="flex items-end gap-2">
          {/* Voice button */}
          <button
            type="button"
            onClick={toggleVoice}
            className={cn(
              "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors",
              isListening
                ? "bg-red-500/20 text-red-400"
                : "bg-card text-muted-foreground active:text-foreground"
            )}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Nachricht schreiben..."
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange focus:outline-none"
            style={{ maxHeight: "120px" }}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-kiln-orange text-white transition-colors disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
