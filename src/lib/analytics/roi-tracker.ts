/**
 * ROI Tracker
 * Berechnet wie viel Zeit und Geld AI Agents den Nutzern einsparen.
 * Vergleicht manuelle Aufwände mit automatisierter Execution.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ──────────────────────────────────────────────────

type Frequency = "daily" | "weekly" | "monthly";

export interface ROIConfigInput {
  manualTimeMinutes: number;
  hourlyRateCents: number;
  frequency: Frequency;
  taskDescription?: string;
}

export interface ROIMetrics {
  runsCompleted: number;
  timeSavedMinutes: number;
  timeSavedHours: number;
  moneySaved: number;
  creditsCost: number;
  eurosCost: number;
  roi: number;
  roiMultiple: string;
  periodDays: number;
}

export interface AgentROIBreakdown extends ROIMetrics {
  agentId: string;
  agentName: string;
}

export interface WeeklyROISummary {
  totalTimeSavedMinutes: number;
  totalTimeSavedHours: number;
  totalMoneySaved: number;
  totalEurosCost: number;
  overallROI: number;
  overallROIMultiple: string;
  agentBreakdown: AgentROIBreakdown[];
}

export interface MonthlyROIReport {
  totalTimeSavedMinutes: number;
  totalTimeSavedHours: number;
  totalMoneySaved: number;
  totalEurosCost: number;
  overallROI: number;
  overallROIMultiple: string;
  agentBreakdown: AgentROIBreakdown[];
}

// ─── Frequency Multiplier ───────────────────────────────────

function getFrequencyMultiplier(frequency: Frequency, periodDays: number): number {
  switch (frequency) {
    case "daily":
      return periodDays;
    case "weekly":
      return periodDays / 7;
    case "monthly":
      return periodDays / 30;
    default:
      return periodDays;
  }
}

// ─── ROI Multiple Formatting ────────────────────────────────

function formatROIMultiple(roi: number): string {
  if (roi <= 0) return "\u2014";
  if (roi > 1) return `${Math.round(roi)}x`;
  return `${roi.toFixed(1)}x`;
}

// ─── ROI Tracker Class ──────────────────────────────────────

export class ROITracker {
  /**
   * ROI-Konfiguration für einen Agent speichern/aktualisieren.
   * Upsert: erstellt oder aktualisiert basierend auf agentId (unique).
   */
  async setTaskValue(agentId: string, config: ROIConfigInput) {
    return prisma.rOIConfig.upsert({
      where: { agentId },
      create: {
        agentId,
        manualTimeMinutes: config.manualTimeMinutes,
        hourlyRateCents: config.hourlyRateCents,
        frequency: config.frequency,
        taskDescription: config.taskDescription ?? null,
      },
      update: {
        manualTimeMinutes: config.manualTimeMinutes,
        hourlyRateCents: config.hourlyRateCents,
        frequency: config.frequency,
        taskDescription: config.taskDescription ?? null,
      },
    });
  }

  /**
   * ROI-Konfiguration eines Agents abrufen.
   */
  async getROIConfig(agentId: string) {
    return prisma.rOIConfig.findUnique({
      where: { agentId },
    });
  }

  /**
   * ROI-Metriken für einen Agent berechnen.
   * Vergleicht tatsächliche Runs mit erwarteten manuellen Durchführungen.
   */
  async calculateROI(agentId: string, periodDays: number = 30): Promise<ROIMetrics> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    // Runs und Conversations parallel laden
    const [agentRunCount, conversationCount, roiConfig, costAgg] = await Promise.all([
      prisma.agentRun.count({
        where: {
          agentId,
          createdAt: { gte: periodStart },
        },
      }),
      prisma.conversation.count({
        where: {
          agentId,
          createdAt: { gte: periodStart },
        },
      }),
      this.getROIConfig(agentId),
      prisma.costRecord.aggregate({
        where: {
          agentId,
          timestamp: { gte: periodStart },
        },
        _sum: {
          costCents: true,
        },
      }),
    ]);

    const totalRuns = agentRunCount + conversationCount;

    // Ohne ROI-Config nur Basis-Metriken zurückgeben
    if (!roiConfig) {
      return {
        runsCompleted: totalRuns,
        timeSavedMinutes: 0,
        timeSavedHours: 0,
        moneySaved: 0,
        creditsCost: 0,
        eurosCost: 0,
        roi: 0,
        roiMultiple: "\u2014",
        periodDays,
      };
    }

    const frequencyMultiplier = getFrequencyMultiplier(
      roiConfig.frequency as Frequency,
      periodDays
    );
    const expectedRuns = frequencyMultiplier;
    const actualRuns = Math.min(totalRuns, expectedRuns);

    // Zeiteinsparung berechnen
    const timeSavedMinutes = actualRuns * roiConfig.manualTimeMinutes;
    const timeSavedHours = timeSavedMinutes / 60;

    // Geldeinsparung berechnen
    const moneySaved = timeSavedHours * (roiConfig.hourlyRateCents / 100);

    // Credit-Kosten aus CostRecord
    const totalCostCents = costAgg._sum.costCents ?? 0;
    const eurosCost = totalCostCents / 100;

    // Credit-Summe separat laden (AiCreditUsage)
    const creditAgg = await prisma.aiCreditUsage.aggregate({
      where: {
        agentId,
        createdAt: { gte: periodStart },
      },
      _sum: {
        creditsUsed: true,
      },
    });
    const creditsCost = creditAgg._sum.creditsUsed ?? 0;

    // ROI berechnen
    const roi = moneySaved > 0 && eurosCost > 0 ? moneySaved / eurosCost : 0;
    const roiMultiple = formatROIMultiple(roi);

    return {
      runsCompleted: totalRuns,
      timeSavedMinutes,
      timeSavedHours,
      moneySaved,
      creditsCost,
      eurosCost,
      roi,
      roiMultiple,
      periodDays,
    };
  }

  /**
   * Wöchentliche ROI-Zusammenfassung über alle Agents eines Nutzers.
   */
  async getWeeklyROISummary(userId: string): Promise<WeeklyROISummary> {
    return this.aggregateROI(userId, 7);
  }

  /**
   * Monatlicher ROI-Report mit detailliertem Agent-Breakdown.
   */
  async getMonthlyROIReport(userId: string): Promise<MonthlyROIReport> {
    return this.aggregateROI(userId, 30);
  }

  /**
   * Interne Methode: ROI über alle Agents aggregieren.
   */
  private async aggregateROI(
    userId: string,
    periodDays: number
  ): Promise<WeeklyROISummary | MonthlyROIReport> {
    // Alle Agents des Nutzers finden, die eine ROI-Config haben
    const agents = await prisma.agent.findMany({
      where: {
        userId,
        roiConfig: { isNot: null },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // ROI für jeden Agent berechnen
    const breakdowns: AgentROIBreakdown[] = await Promise.all(
      agents.map(async (agent) => {
        const metrics = await this.calculateROI(agent.id, periodDays);
        return {
          ...metrics,
          agentId: agent.id,
          agentName: agent.name,
        };
      })
    );

    // Metriken summieren
    let totalTimeSavedMinutes = 0;
    let totalMoneySaved = 0;
    let totalEurosCost = 0;

    for (const b of breakdowns) {
      totalTimeSavedMinutes += b.timeSavedMinutes;
      totalMoneySaved += b.moneySaved;
      totalEurosCost += b.eurosCost;
    }

    const totalTimeSavedHours = totalTimeSavedMinutes / 60;
    const overallROI = totalMoneySaved > 0 && totalEurosCost > 0
      ? totalMoneySaved / totalEurosCost
      : 0;
    const overallROIMultiple = formatROIMultiple(overallROI);

    return {
      totalTimeSavedMinutes,
      totalTimeSavedHours,
      totalMoneySaved,
      totalEurosCost,
      overallROI,
      overallROIMultiple,
      agentBreakdown: breakdowns,
    };
  }
}

// ─── Singleton Export ───────────────────────────────────────

export const roiTracker = new ROITracker();
