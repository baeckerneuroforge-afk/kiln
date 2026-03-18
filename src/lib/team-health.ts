import { prisma } from "@/lib/prisma";

export interface TeamHealthScore {
  overall: number; // 0-100
  color: "green" | "yellow" | "red";
  categories: {
    name: string;
    score: number;
    weight: number;
    explanation: string;
  }[];
  weakestLink: {
    agentName: string;
    memberId: string;
    errorRate: number;
    suggestion: string;
  } | null;
  trend: {
    current: number;
    previous: number;
    direction: "up" | "down" | "stable";
  };
  suggestions: string[];
}

// Berechnet den Health Score für ein Team basierend auf den letzten 30 Tagen
export async function calculateHealthScore(
  teamId: string
): Promise<TeamHealthScore> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Alle Executions der letzten 30 Tage laden
  const executions = await prisma.teamExecution.findMany({
    where: {
      teamId,
      startedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { startedAt: "asc" },
  });

  // Weniger als 3 Executions → Standardwert zurückgeben
  if (executions.length < 3) {
    return buildInsufficientDataResult();
  }

  // Execution-Logs und Approval-Requests parallel laden
  const executionIds = executions.map((e) => e.id);

  const [logs, approvalRequests, allTimeLogs] = await Promise.all([
    prisma.teamExecutionLog.findMany({
      where: { executionId: { in: executionIds } },
      include: { agent: { select: { id: true, name: true } } },
    }),
    prisma.approvalRequest.findMany({
      where: { teamExecutionId: { in: executionIds } },
    }),
    // Erste 10 Executions für Baseline laden (können älter als 30 Tage sein)
    prisma.teamExecution.findMany({
      where: { teamId, status: "COMPLETED" },
      orderBy: { startedAt: "asc" },
      take: 10,
    }),
  ]);

  // --- 1. Success Rate (Gewicht: 30%) ---
  const successRate = calculateSuccessRate(executions);

  // --- 2. Average Execution Time (Gewicht: 15%) ---
  const executionTimeScore = calculateExecutionTimeScore(
    executions,
    allTimeLogs
  );

  // --- 3. Routing Accuracy (Gewicht: 20%) ---
  const routingAccuracy = calculateRoutingAccuracy(logs);

  // --- 4. Per-Agent Error Rate (Gewicht: 20%) ---
  const { score: agentErrorScore, weakestLink } =
    calculateAgentErrorRate(logs);

  // --- 5. Approval Gate Speed (Gewicht: 15%) ---
  const approvalSpeed = calculateApprovalSpeed(approvalRequests);

  // Kategorien zusammenstellen
  const categories = [
    {
      name: "Erfolgsrate",
      score: successRate,
      weight: 0.3,
      explanation: buildExplanation("Erfolgsrate", successRate, executions),
    },
    {
      name: "Ausführungszeit",
      score: executionTimeScore,
      weight: 0.15,
      explanation: buildExplanation(
        "Ausführungszeit",
        executionTimeScore,
        executions
      ),
    },
    {
      name: "Routing-Genauigkeit",
      score: routingAccuracy,
      weight: 0.2,
      explanation: buildExplanation("Routing-Genauigkeit", routingAccuracy),
    },
    {
      name: "Agent-Fehlerrate",
      score: agentErrorScore,
      weight: 0.2,
      explanation: buildExplanation("Agent-Fehlerrate", agentErrorScore),
    },
    {
      name: "Genehmigungsgeschwindigkeit",
      score: approvalSpeed,
      weight: 0.15,
      explanation: buildExplanation(
        "Genehmigungsgeschwindigkeit",
        approvalSpeed,
        undefined,
        approvalRequests.length
      ),
    },
  ];

  // Gewichteter Durchschnitt
  const overall = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0)
  );

  // Trend berechnen: aktuelle 2 Wochen vs. vorherige 2 Wochen
  const trend = calculateTrend(executions, fourteenDaysAgo);

  // Farbe bestimmen
  const color = overall >= 80 ? "green" : overall >= 50 ? "yellow" : "red";

  // Vorschläge generieren
  const suggestions = generateSuggestions(categories, weakestLink);

  return {
    overall,
    color,
    categories,
    weakestLink,
    trend,
    suggestions,
  };
}

// --- Hilfsfunktionen ---

function calculateSuccessRate(
  executions: { status: string }[]
): number {
  const finished = executions.filter(
    (e) => e.status === "COMPLETED" || e.status === "FAILED" || e.status === "PARTIAL"
  );
  if (finished.length === 0) return 50;
  const successful = finished.filter((e) => e.status === "COMPLETED").length;
  return Math.round((successful / finished.length) * 100);
}

function calculateExecutionTimeScore(
  recentExecutions: { status: string; startedAt: Date; completedAt: Date | null }[],
  baselineExecutions: { status: string; startedAt: Date; completedAt: Date | null }[]
): number {
  const completedRecent = recentExecutions.filter(
    (e) => e.status === "COMPLETED" && e.completedAt
  );
  if (completedRecent.length === 0) return 50;

  const recentAvg = averageDuration(completedRecent);

  const completedBaseline = baselineExecutions.filter(
    (e) => e.status === "COMPLETED" && e.completedAt
  );
  if (completedBaseline.length === 0) return 75; // Kein Baseline → neutraler Wert

  const baselineAvg = averageDuration(completedBaseline);
  if (baselineAvg === 0) return 75;

  // Verhältnis: schneller als Baseline = besser
  const ratio = recentAvg / baselineAvg;

  if (ratio <= 0.5) return 100; // Doppelt so schnell
  if (ratio <= 0.8) return 90;
  if (ratio <= 1.0) return 80;
  if (ratio <= 1.2) return 70;
  if (ratio <= 1.5) return 55;
  if (ratio <= 2.0) return 35;
  return 15; // Mehr als doppelt so langsam
}

function averageDuration(
  items: { startedAt: Date; completedAt: Date | null }[]
): number {
  const durations = items
    .filter((i) => i.completedAt)
    .map(
      (i) => (i.completedAt as Date).getTime() - i.startedAt.getTime()
    );
  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function calculateRoutingAccuracy(
  logs: { executionId: string; taskIndex: number; attempt: number; status: string }[]
): number {
  // Tasks gruppieren nach executionId + taskIndex
  const taskMap = new Map<string, { maxAttempt: number; hasSuccess: boolean }>();

  for (const log of logs) {
    const key = `${log.executionId}:${log.taskIndex}`;
    const existing = taskMap.get(key);
    if (!existing) {
      taskMap.set(key, {
        maxAttempt: log.attempt,
        hasSuccess: log.status === "COMPLETED",
      });
    } else {
      existing.maxAttempt = Math.max(existing.maxAttempt, log.attempt);
      if (log.status === "COMPLETED") existing.hasSuccess = true;
    }
  }

  if (taskMap.size === 0) return 50;

  // Tasks die beim ersten Versuch erfolgreich waren
  let firstAttemptSuccess = 0;
  taskMap.forEach((task) => {
    if (task.maxAttempt === 1 && task.hasSuccess) {
      firstAttemptSuccess++;
    }
  });

  return Math.round((firstAttemptSuccess / taskMap.size) * 100);
}

function calculateAgentErrorRate(
  logs: {
    agentId: string | null;
    status: string;
    agent: { id: string; name: string } | null;
  }[]
): {
  score: number;
  weakestLink: TeamHealthScore["weakestLink"];
} {
  // Logs pro Agent gruppieren
  const agentStats = new Map<
    string,
    { name: string; total: number; errors: number }
  >();

  for (const log of logs) {
    if (!log.agentId || !log.agent) continue;
    const existing = agentStats.get(log.agentId);
    if (!existing) {
      agentStats.set(log.agentId, {
        name: log.agent.name,
        total: 1,
        errors: log.status === "FAILED" ? 1 : 0,
      });
    } else {
      existing.total++;
      if (log.status === "FAILED") existing.errors++;
    }
  }

  if (agentStats.size === 0) {
    return { score: 50, weakestLink: null };
  }

  // Gesamt-Fehlerrate über alle Agents
  let totalLogs = 0;
  let totalErrors = 0;
  let worstAgentId = "";
  let worstErrorRate = 0;

  agentStats.forEach((stats, agentId) => {
    totalLogs += stats.total;
    totalErrors += stats.errors;
    const errorRate = stats.errors / stats.total;
    if (errorRate > worstErrorRate) {
      worstErrorRate = errorRate;
      worstAgentId = agentId;
    }
  });

  const overallErrorRate = totalLogs > 0 ? totalErrors / totalLogs : 0;
  // Score: 100 = keine Fehler, 0 = alle fehlerhaft
  const score = Math.round((1 - overallErrorRate) * 100);

  let weakestLink: TeamHealthScore["weakestLink"] = null;
  if (worstAgentId && worstErrorRate > 0) {
    const worstAgent = agentStats.get(worstAgentId)!;
    weakestLink = {
      agentName: worstAgent.name,
      memberId: worstAgentId,
      errorRate: Math.round(worstErrorRate * 100),
      suggestion:
        worstErrorRate > 0.5
          ? `Agent "${worstAgent.name}" hat eine Fehlerrate von ${Math.round(worstErrorRate * 100)}%. Systemanweisung und Wissensquellen prüfen.`
          : `Agent "${worstAgent.name}" zeigt gelegentliche Fehler (${Math.round(worstErrorRate * 100)}%). Aufgaben-Beschreibungen oder Kontext verbessern.`,
    };
  }

  return { score, weakestLink };
}

function calculateApprovalSpeed(
  requests: { status: string; requestedAt: Date; respondedAt: Date | null }[]
): number {
  const responded = requests.filter((r) => r.respondedAt);
  if (responded.length === 0) {
    // Keine Approval-Gates → volle Punktzahl (kein Bottleneck)
    return requests.length === 0 ? 100 : 30;
  }

  const avgResponseMs =
    responded.reduce(
      (sum, r) =>
        sum + ((r.respondedAt as Date).getTime() - r.requestedAt.getTime()),
      0
    ) / responded.length;

  const avgMinutes = avgResponseMs / (1000 * 60);

  // Bewertung basierend auf durchschnittlicher Antwortzeit
  if (avgMinutes <= 5) return 100;
  if (avgMinutes <= 15) return 85;
  if (avgMinutes <= 30) return 70;
  if (avgMinutes <= 60) return 55;
  if (avgMinutes <= 120) return 40;
  if (avgMinutes <= 480) return 25;
  return 10;
}

function calculateTrend(
  executions: { status: string; startedAt: Date }[],
  fourteenDaysAgo: Date
): TeamHealthScore["trend"] {
  const recent = executions.filter((e) => e.startedAt >= fourteenDaysAgo);
  const previous = executions.filter((e) => e.startedAt < fourteenDaysAgo);

  const currentScore = recent.length > 0 ? calculateSuccessRate(recent) : 50;
  const previousScore =
    previous.length > 0 ? calculateSuccessRate(previous) : 50;

  const diff = currentScore - previousScore;
  const direction: "up" | "down" | "stable" =
    diff > 5 ? "up" : diff < -5 ? "down" : "stable";

  return { current: currentScore, previous: previousScore, direction };
}

function buildExplanation(
  category: string,
  score: number,
  executions?: { status: string }[],
  approvalCount?: number
): string {
  if (score >= 80) {
    return `${category} ist ausgezeichnet.`;
  }
  if (score >= 50) {
    if (category === "Erfolgsrate" && executions) {
      const failed = executions.filter(
        (e) => e.status === "FAILED" || e.status === "PARTIAL"
      ).length;
      return `${category} könnte verbessert werden. ${failed} Ausführung(en) fehlgeschlagen oder unvollständig.`;
    }
    if (category === "Genehmigungsgeschwindigkeit") {
      return `${category} ist akzeptabel, aber Genehmigungen dauern teils zu lang.`;
    }
    return `${category} ist akzeptabel, aber es gibt Verbesserungspotenzial.`;
  }
  if (category === "Erfolgsrate") {
    return `${category} ist kritisch niedrig. Viele Ausführungen scheitern.`;
  }
  if (category === "Genehmigungsgeschwindigkeit" && approvalCount === 0) {
    return `Alle Genehmigungsanfragen sind noch unbeantwortet.`;
  }
  return `${category} ist unter dem Zielwert. Dringender Handlungsbedarf.`;
}

function generateSuggestions(
  categories: { name: string; score: number }[],
  weakestLink: TeamHealthScore["weakestLink"]
): string[] {
  const suggestions: string[] = [];

  // Sortiert nach schlechtestem Score
  const sorted = [...categories].sort((a, b) => a.score - b.score);

  for (const cat of sorted) {
    if (cat.score >= 80) continue;

    switch (cat.name) {
      case "Erfolgsrate":
        suggestions.push(
          "Fehlgeschlagene Ausführungen analysieren und häufige Fehlerursachen beheben."
        );
        break;
      case "Ausführungszeit":
        suggestions.push(
          "Ausführungszeiten prüfen — komplexe Aufgaben ggf. aufteilen oder Modell-Parameter anpassen."
        );
        break;
      case "Routing-Genauigkeit":
        suggestions.push(
          "Task-Beschreibungen präzisieren, damit Agents Aufgaben beim ersten Versuch korrekt lösen."
        );
        break;
      case "Agent-Fehlerrate":
        suggestions.push(
          "Agents mit hoher Fehlerrate identifizieren und deren Systemanweisungen optimieren."
        );
        break;
      case "Genehmigungsgeschwindigkeit":
        suggestions.push(
          "Genehmigungsprozesse beschleunigen — E-Mail-Benachrichtigungen einrichten oder automatische Genehmigung erwägen."
        );
        break;
    }
  }

  if (weakestLink && weakestLink.errorRate > 30) {
    suggestions.push(weakestLink.suggestion);
  }

  // Maximal 4 Vorschläge
  return suggestions.slice(0, 4);
}

function buildInsufficientDataResult(): TeamHealthScore {
  return {
    overall: 50,
    color: "yellow",
    categories: [
      {
        name: "Erfolgsrate",
        score: 50,
        weight: 0.3,
        explanation: "Nicht genügend Daten für eine Bewertung (weniger als 3 Ausführungen).",
      },
      {
        name: "Ausführungszeit",
        score: 50,
        weight: 0.15,
        explanation: "Nicht genügend Daten für eine Bewertung.",
      },
      {
        name: "Routing-Genauigkeit",
        score: 50,
        weight: 0.2,
        explanation: "Nicht genügend Daten für eine Bewertung.",
      },
      {
        name: "Agent-Fehlerrate",
        score: 50,
        weight: 0.2,
        explanation: "Nicht genügend Daten für eine Bewertung.",
      },
      {
        name: "Genehmigungsgeschwindigkeit",
        score: 50,
        weight: 0.15,
        explanation: "Nicht genügend Daten für eine Bewertung.",
      },
    ],
    weakestLink: null,
    trend: { current: 50, previous: 50, direction: "stable" },
    suggestions: [
      "Mehr Team-Ausführungen durchführen, um aussagekräftige Metriken zu erhalten.",
    ],
  };
}
