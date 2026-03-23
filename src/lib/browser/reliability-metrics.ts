/**
 * Reliability Metrics
 * Trackt Erfolgsraten pro Strategie, Domain und Aktionstyp.
 * Empfiehlt basierend auf historischen Daten die beste Strategie.
 */

import { prisma } from "@/lib/prisma";

/* ── Types ── */

export interface MetricEntry {
  domain: string;
  actionType: string;
  strategy: string;
  success: boolean;
  durationMs: number;
  creditsCost: number;
}

export interface StrategyRecommendation {
  strategy: string;
  successRate: number;
  avgDurationMs: number;
  sampleSize: number;
}

export interface SessionStats {
  totalActions: number;
  domVerifications: number;
  visionVerifications: number;
  screenshotsSkipped: number;
  screenshotsTaken: number;
  creditsSaved: number;
  firstTrySuccessRate: number;
  elementFinderStats: { semantic: number; css: number; xpath: number; vision: number };
}

/* ── In-Memory Session Tracking ── */

interface SessionMetric {
  domain: string;
  actionType: string;
  strategy: string;
  success: boolean;
  durationMs: number;
  creditsCost: number;
}

/* ── Reliability Metrics ── */

export class ReliabilityMetrics {
  private sessionMetrics: SessionMetric[] = [];
  private domVerifications = 0;
  private visionVerifications = 0;
  private screenshotsSkipped = 0;
  private screenshotsTaken = 0;

  /**
   * Zeichnet eine Aktion auf (in-memory für die laufende Session).
   */
  record(entry: MetricEntry): void {
    this.sessionMetrics.push(entry);
  }

  /** Zählt eine DOM-basierte Verifizierung */
  recordDomVerification(): void {
    this.domVerifications++;
  }

  /** Zählt eine Vision-basierte Verifizierung */
  recordVisionVerification(): void {
    this.visionVerifications++;
  }

  /** Zählt einen übersprungenen Screenshot */
  recordScreenshotSkipped(): void {
    this.screenshotsSkipped++;
  }

  /** Zählt einen genommenen Screenshot */
  recordScreenshotTaken(): void {
    this.screenshotsTaken++;
  }

  /**
   * Gibt die empfohlene Strategie für eine Domain/Aktionstyp-Kombination zurück.
   * Basierend auf Session-Daten (in-memory).
   */
  getRecommendedStrategy(domain: string, actionType: string): StrategyRecommendation | null {
    const relevant = this.sessionMetrics.filter(
      m => m.domain === domain && m.actionType === actionType
    );
    if (relevant.length < 3) return null;

    // Gruppiere nach Strategie
    const byStrategy = new Map<string, { successes: number; total: number; totalMs: number }>();
    for (const m of relevant) {
      const s = byStrategy.get(m.strategy) || { successes: 0, total: 0, totalMs: 0 };
      s.total++;
      if (m.success) s.successes++;
      s.totalMs += m.durationMs;
      byStrategy.set(m.strategy, s);
    }

    // Beste Strategie nach Erfolgsrate, dann nach Geschwindigkeit
    let best: StrategyRecommendation | null = null;
    for (const [strategy, stats] of byStrategy) {
      const rate = stats.successes / stats.total;
      const avg = stats.totalMs / stats.total;
      if (!best || rate > best.successRate || (rate === best.successRate && avg < best.avgDurationMs)) {
        best = { strategy, successRate: rate, avgDurationMs: avg, sampleSize: stats.total };
      }
    }

    return best;
  }

  /**
   * Gibt die Domain-Zuverlässigkeit zurück.
   */
  getDomainReliability(domain: string): { successRate: number; totalActions: number } {
    const relevant = this.sessionMetrics.filter(m => m.domain === domain);
    if (relevant.length === 0) return { successRate: 1, totalActions: 0 };

    const successes = relevant.filter(m => m.success).length;
    return {
      successRate: Math.round((successes / relevant.length) * 100) / 100,
      totalActions: relevant.length,
    };
  }

  /**
   * Gibt Session-Statistiken zurück.
   */
  getSessionStats(): SessionStats {
    const successes = this.sessionMetrics.filter(m => m.success).length;
    const total = this.sessionMetrics.length;

    // Credits gespart: DOM-Verifizierungen * ~2 Credits (pro Vision-Aufruf)
    // + übersprungene Screenshots * ~2 Credits
    const creditsSaved = (this.domVerifications * 2) + (this.screenshotsSkipped * 2);

    return {
      totalActions: total,
      domVerifications: this.domVerifications,
      visionVerifications: this.visionVerifications,
      screenshotsSkipped: this.screenshotsSkipped,
      screenshotsTaken: this.screenshotsTaken,
      creditsSaved,
      firstTrySuccessRate: total > 0 ? Math.round((successes / total) * 100) / 100 : 1,
      elementFinderStats: { semantic: 0, css: 0, xpath: 0, vision: 0 }, // Wird vom ElementFinder befüllt
    };
  }

  /**
   * Persistiert Session-Metriken in die DB (non-blocking).
   * Wird am Ende einer Execution aufgerufen.
   */
  async persistMetrics(agentId: string, executionId: string): Promise<void> {
    if (this.sessionMetrics.length === 0) return;

    try {
      await prisma.actionMetric.createMany({
        data: this.sessionMetrics.map(m => ({
          domain: m.domain,
          actionType: m.actionType,
          strategy: m.strategy,
          success: m.success,
          durationMs: m.durationMs,
          creditsCost: m.creditsCost,
          agentId,
          executionId,
        })),
      });
    } catch (err) {
      // Non-blocking: Metriken sind nicht kritisch
      console.warn("[ReliabilityMetrics] Persist fehlgeschlagen:", err);
    }
  }
}
