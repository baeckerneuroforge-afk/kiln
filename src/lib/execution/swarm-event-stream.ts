/**
 * Swarm Event Stream
 * Streams swarm progress events for real-time UI updates and replay.
 */

/* ── Event Types ── */

export type SwarmEventType =
  | "swarm.started"
  | "agent.started"
  | "agent.tool_called"
  | "agent.finding"
  | "agent.message"
  | "agent.spawned"
  | "agent.completed"
  | "agent.failed"
  | "merge.started"
  | "merge.conflict"
  | "merge.completed"
  | "swarm.completed";

export interface SwarmEvent {
  type: SwarmEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export type SwarmEventListener = (event: SwarmEvent) => void;

/* ── SwarmEventStream Class ── */

export class SwarmEventStream {
  private events: SwarmEvent[] = [];
  private listeners: SwarmEventListener[] = [];

  emit(type: SwarmEventType, data: Record<string, unknown>): void {
    const event: SwarmEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    this.events.push(event);

    for (const listener of this.listeners) {
      try { listener(event); } catch { /* listener error */ }
    }
  }

  on(listener: SwarmEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Komplettes Event-Log für Replay / DB-Persistierung.
   */
  getEventLog(): SwarmEvent[] {
    return [...this.events];
  }

  get eventCount(): number {
    return this.events.length;
  }

  /* ── Convenience Emitters ── */

  swarmStarted(totalAgents: number, goal: string): void {
    this.emit("swarm.started", { totalAgents, goal });
  }

  agentStarted(agentId: string, task: string, model: string, tools?: string[]): void {
    this.emit("agent.started", { agentId, task, model, tools });
  }

  agentToolCalled(agentId: string, tool: string, args: Record<string, unknown>): void {
    this.emit("agent.tool_called", { agentId, tool, args: summarizeArgs(args) });
  }

  agentFinding(agentId: string, key: string, value: unknown): void {
    this.emit("agent.finding", { agentId, key, value });
  }

  agentMessage(from: string, to: string, message: string): void {
    this.emit("agent.message", { from, to, message });
  }

  agentSpawned(parentId: string, newAgentId: string, task: string): void {
    this.emit("agent.spawned", { parentId, newAgentId, task });
  }

  agentCompleted(agentId: string, resultSummary: string, cost: number): void {
    this.emit("agent.completed", { agentId, resultSummary: resultSummary.slice(0, 500), cost });
  }

  agentFailed(agentId: string, error: string, willRetry: boolean): void {
    this.emit("agent.failed", { agentId, error, willRetry });
  }

  mergeStarted(strategy: string): void {
    this.emit("merge.started", { strategy });
  }

  mergeConflict(description: string): void {
    this.emit("merge.conflict", { description });
  }

  mergeCompleted(qualityScore: number): void {
    this.emit("merge.completed", { qualityScore });
  }

  swarmCompleted(totalCost: number, totalAgents: number, duration: number, qualityScore: number): void {
    this.emit("swarm.completed", { totalCost, totalAgents, duration, qualityScore });
  }
}

/** Kürzt große Args-Objekte für Event-Logging */
function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > 200) {
      summary[key] = value.slice(0, 200) + "…";
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
