"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import type { DepartmentChannelMessageView } from "./types";

export function ChannelMessageList({
  messages,
}: {
  messages: DepartmentChannelMessageView[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-6 text-sm text-muted-foreground">
        No channel messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const selected = selectedId === message.id;
        const body = message.channel === "EMAIL" ? message.emailBody : message.whatsappBody;
        const sender = message.channel === "EMAIL" ? message.emailFrom : message.whatsappFrom;
        const recipient = message.channel === "EMAIL" ? message.emailTo : message.whatsappTo;
        const Icon = message.channel === "EMAIL" ? Mail : MessageCircle;
        return (
          <button
            key={message.id}
            type="button"
            onClick={() => setSelectedId(selected ? null : message.id)}
            className="w-full rounded-lg border border-border bg-card/70 p-4 text-left transition hover:border-orange-500/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 shrink-0 text-orange-300" />
                <span>{message.channel}</span>
                <span className="text-muted-foreground">·</span>
                <span>{message.direction}</span>
              </div>
              <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
                {message.status}
              </span>
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {sender || "unknown"} → {recipient || "unknown"}
            </p>
            {message.emailSubject ? (
              <p className="mt-2 text-sm text-foreground">{message.emailSubject}</p>
            ) : null}
            {selected ? (
              <pre className="mt-3 max-h-80 overflow-auto rounded border border-border/70 bg-black/25 p-3 text-xs whitespace-pre-wrap text-slate-200">
                {body || message.blockedReason || message.errorMessage || "(empty)"}
              </pre>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
