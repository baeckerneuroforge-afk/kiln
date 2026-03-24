/**
 * Shared Workspace — Inter-Agent Memory During Swarm Execution
 * Append-only, concurrent-safe shared state for sub-agents to read/write findings
 * and send directed or broadcast messages to each other.
 */

import type { EvidenceSourceMeta } from "./hallucination-guard";

/* ── Types ── */

export interface WorkspaceEntry {
  agentId: string;
  key: string;
  value: unknown;
  tags: string[];
  source?: EvidenceSourceMeta;
  timestamp: string;
}

export interface AgentMessage {
  from: string;
  to: string | "*"; // "*" = broadcast
  message: string;
  timestamp: string;
}

export interface WorkspaceSnapshot {
  swarmExecutionId: string;
  entries: WorkspaceEntry[];
  messages: AgentMessage[];
  createdAt: string;
}

export type WorkspaceSubscriber = (entry: WorkspaceEntry) => void;

/* ── SharedWorkspace Class ── */

export class SharedWorkspace {
  private entries: WorkspaceEntry[] = [];
  private messages: AgentMessage[] = [];
  private deliveredMessages: Map<string, number> = new Map(); // agentId → last delivered index
  private subscribers: WorkspaceSubscriber[] = [];
  readonly swarmExecutionId: string;

  constructor(swarmExecutionId: string) {
    this.swarmExecutionId = swarmExecutionId;
  }

  /**
   * Agent schreibt ein Finding in den Workspace.
   * Append-only — keine Überschreibungen, concurrent-safe via Array.push.
   */
  write(
    agentId: string,
    key: string,
    value: unknown,
    tags: string[] = [],
    source?: EvidenceSourceMeta
  ): void {
    const entry: WorkspaceEntry = {
      agentId,
      key,
      value,
      tags,
      source,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);

    // Subscriber benachrichtigen
    for (const sub of this.subscribers) {
      try { sub(entry); } catch { /* subscriber error — nicht blocken */ }
    }
  }

  /**
   * Liest einen bestimmten Key oder alle Entries.
   */
  read(key?: string): WorkspaceEntry[] {
    if (!key) return [...this.entries];
    return this.entries.filter((e) => e.key === key);
  }

  /**
   * Alle Findings eines bestimmten Agents.
   */
  readByAgent(agentId: string): WorkspaceEntry[] {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  /**
   * Alle Findings mit einem bestimmten Tag.
   */
  readByTag(tag: string): WorkspaceEntry[] {
    return this.entries.filter((e) => e.tags.includes(tag));
  }

  /**
   * Sendet eine gerichtete Nachricht an einen bestimmten Agent.
   */
  sendMessage(fromAgentId: string, toAgentId: string, message: string): void {
    this.messages.push({
      from: fromAgentId,
      to: toAgentId,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Sendet eine Broadcast-Nachricht an alle anderen Agents.
   */
  broadcast(fromAgentId: string, message: string): void {
    this.messages.push({
      from: fromAgentId,
      to: "*",
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Holt neue (ungelesene) Nachrichten für einen bestimmten Agent.
   * Tracked welche Nachrichten bereits zugestellt wurden.
   */
  getMessages(agentId: string): AgentMessage[] {
    const lastDelivered = this.deliveredMessages.get(agentId) ?? 0;
    const pending: AgentMessage[] = [];

    for (let i = lastDelivered; i < this.messages.length; i++) {
      const msg = this.messages[i];
      if (msg.to === agentId || (msg.to === "*" && msg.from !== agentId)) {
        pending.push(msg);
      }
    }

    this.deliveredMessages.set(agentId, this.messages.length);
    return pending;
  }

  /**
   * Subscriber für neue Entries registrieren (für Streaming).
   */
  subscribe(callback: WorkspaceSubscriber): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  /**
   * Kompletter Workspace-State als JSON (für DB-Persistierung).
   */
  getSnapshot(): WorkspaceSnapshot {
    return {
      swarmExecutionId: this.swarmExecutionId,
      entries: [...this.entries],
      messages: [...this.messages],
      createdAt: new Date().toISOString(),
    };
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get messageCount(): number {
    return this.messages.length;
  }
}
