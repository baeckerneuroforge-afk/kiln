/**
 * Server-Sent Events (SSE) — Echtzeit-Events für verbundene Clients.
 *
 * Nutzt einen In-Memory Event-Bus. In Production mit Redis Pub/Sub erweiterbar.
 */

type EventListener = (event: string, data: unknown) => void;

interface SSESubscription {
  id: string;
  userId: string;
  events: string[]; // Subscribed event types, or ["*"] for all
  listener: EventListener;
  lastPing: number;
}

const HEARTBEAT_INTERVAL = 30000; // 30s

class RealtimeEventBus {
  private subscriptions = new Map<string, SSESubscription>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Subscribe: Registriert einen SSE-Listener.
   */
  subscribe(
    subscriptionId: string,
    userId: string,
    events: string[],
    listener: EventListener
  ): void {
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      userId,
      events,
      listener,
      lastPing: Date.now(),
    });
  }

  /**
   * Unsubscribe: Entfernt einen SSE-Listener.
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Emit: Sendet ein Event an alle passenden Subscriber.
   */
  emit(userId: string, eventType: string, data: unknown): void {
    for (const sub of this.subscriptions.values()) {
      if (sub.userId !== userId) continue;
      if (!sub.events.includes("*") && !sub.events.includes(eventType)) continue;

      try {
        sub.listener(eventType, data);
      } catch {
        // Listener Error — abbrechen
        this.subscriptions.delete(sub.id);
      }
    }
  }

  /**
   * Heartbeat: Alle 30s ein Ping an alle Subscriber.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const sub of this.subscriptions.values()) {
        try {
          sub.listener("ping", { timestamp: new Date().toISOString() });
          sub.lastPing = now;
        } catch {
          // Connection broken
          this.subscriptions.delete(sub.id);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Anzahl aktiver Verbindungen.
   */
  getConnectionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Anzahl Verbindungen für einen bestimmten User.
   */
  getUserConnectionCount(userId: string): number {
    let count = 0;
    for (const sub of this.subscriptions.values()) {
      if (sub.userId === userId) count++;
    }
    return count;
  }
}

// Singleton
export const realtimeEvents = new RealtimeEventBus();
