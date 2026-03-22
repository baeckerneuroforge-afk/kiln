"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, ArrowUp, Loader2, Bot, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---

interface ToolCall {
  name: string;
  result: string;
}

interface MetaAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

// --- Constants ---

const STORAGE_KEY = "kiln_meta_agent_chat";

const WELCOME_MESSAGE: MetaAgentMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hallo! Ich bin dein KILN Assistant. Wie kann ich helfen?",
};

const SUGGESTION_CHIPS = [
  "Wie performen meine Agents?",
  "Erstelle einen Monitoring Agent",
  "Was ist mein ROI diesen Monat?",
  "Zeig mir den Marketplace",
] as const;

// --- Helpers ---

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadMessages(): MetaAgentMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as MetaAgentMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Korrupte Daten ignorieren
  }
  return [];
}

function saveMessages(messages: MetaAgentMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Storage voll oder nicht verfügbar
  }
}

// --- Typing Indicator ---

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800">
        <Bot className="h-4 w-4 text-orange-400" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-zinc-800/50 px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// --- Main Component ---

export function MetaAgentChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<MetaAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Hydration-safe mount + localStorage restore
  useEffect(() => {
    setHasMounted(true);
    const stored = loadMessages();
    if (stored.length > 0) {
      setMessages(stored);
    }
    // Check Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
    }
    // Pulse-Animation nach 3 Sekunden stoppen
    const timer = setTimeout(() => setShowPulse(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Persist messages
  useEffect(() => {
    if (hasMounted && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, hasMounted]);

  // Auto-scroll bei neuen Nachrichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen) {
      // Kurze Verzögerung für die Animation
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key schließt das Panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
        'button, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || isLoading) return;

      const userMessage: MetaAgentMessage = {
        id: generateId(),
        role: "user",
        content: messageText,
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setIsLoading(true);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      try {
        // conversationHistory für API-Kontext aufbauen
        const conversationHistory = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch("/api/meta-agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: messageText,
            conversationHistory,
          }),
        });

        if (!response.ok) {
          throw new Error(`API Fehler: ${response.status}`);
        }

        const data = await response.json();

        const assistantMessage: MetaAgentMessage = {
          id: generateId(),
          role: "assistant",
          content: data.content ?? data.message ?? "Keine Antwort erhalten.",
          toolCalls: data.toolCalls,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch {
        const errorMessage: MetaAgentMessage = {
          id: generateId(),
          role: "assistant",
          content:
            "Es gab ein Problem bei der Verarbeitung. Bitte versuche es erneut.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, messages]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Nachrichten für die Anzeige (inkl. Welcome Message wenn leer)
  const displayMessages =
    messages.length === 0 ? [WELCOME_MESSAGE] : messages;
  const showSuggestions = messages.length === 0;

  // --- Collapsed State: Floating Button ---
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="KILN Assistant öffnen"
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-orange-500 to-orange-600",
          "shadow-lg shadow-orange-500/25",
          "transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-orange-500/30",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          showPulse && "animate-pulse"
        )}
      >
        <Sparkles className="h-6 w-6 text-white" />
      </button>
    );
  }

  // --- Expanded State: Chat Panel ---
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="KILN Assistant Chat"
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "flex w-96 flex-col",
        "h-[32rem] max-h-[80vh]",
        "rounded-2xl border border-zinc-800 bg-zinc-950",
        "shadow-2xl shadow-black/50",
        "animate-in fade-in slide-in-from-bottom-4 duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-zinc-100">
            KILN Assistant
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Chat schließen"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            "text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scroll-smooth px-2 py-3">
        {displayMessages.map((msg) => (
          <div key={msg.id} className="mb-3">
            {/* Tool Calls (vor der eigentlichen Nachricht) */}
            {msg.toolCalls &&
              msg.toolCalls.length > 0 &&
              msg.toolCalls.map((tc, idx) => (
                <div
                  key={`${msg.id}-tool-${idx}`}
                  className="mb-2 ml-11 rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-3 py-2"
                >
                  <p className="text-xs font-medium text-orange-400/80">
                    {tc.name}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">{tc.result}</p>
                </div>
              ))}

            {/* Message Bubble */}
            {msg.role === "assistant" ? (
              <div className="flex items-start gap-3 px-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                  <Bot className="h-4 w-4 text-orange-400" />
                </div>
                <div className="max-w-[85%] rounded-2xl bg-zinc-800/50 px-4 py-2.5">
                  <p className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex justify-end px-2">
                <div className="max-w-[85%] rounded-2xl bg-orange-500/20 px-4 py-2.5">
                  <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Typing Indicator */}
        {isLoading && <TypingIndicator />}

        {/* Suggestion Chips */}
        {showSuggestions && !isLoading && (
          <div className="mt-2 flex flex-wrap gap-2 px-4">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => handleSend(chip)}
                className={cn(
                  "rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1.5",
                  "text-xs text-zinc-400 transition-all",
                  "hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-300",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                )}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-800 px-3 py-3">
        <div className="flex items-end gap-2">
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              aria-label={isRecording ? "Aufnahme stoppen" : "Spracheingabe"}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                isRecording
                  ? "bg-red-500/20 text-red-400 animate-pulse"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              )}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Was möchtest du tun?"
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5",
              "text-sm text-zinc-100 placeholder:text-zinc-600",
              "focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30",
              "scrollbar-thin scrollbar-thumb-zinc-700"
            )}
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            aria-label="Nachricht senden"
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              "transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
              input.trim() && !isLoading
                ? "bg-orange-500 text-white hover:bg-orange-400"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
