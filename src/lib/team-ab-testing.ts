import { prisma } from "@/lib/prisma";
import { TeamABTestStatus } from "@prisma/client";

export interface CreateABTestConfig {
  name: string;
  teamAId: string;
  teamBId: string;
  splitPercentage?: number; // Default 50
  metric?: string; // completion_rate | cost | speed | lead_quality
  maxExecutions?: number;
}

export interface ABTestTeamStats {
  executions: number;
  completed: number;
  failed: number;
  avgCost: number;
  avgDurationMs: number;
  successRate: number;
  totalCost: number;
}

export interface ABTestResults {
  teamA: ABTestTeamStats;
  teamB: ABTestTeamStats;
  winner: "A" | "B" | "TIE" | "INSUFFICIENT_DATA";
  confidence: number; // 0–1
  metric: string;
}

// Erstelle A/B Test
export async function createABTest(userId: string, config: CreateABTestConfig) {
  const { name, teamAId, teamBId, splitPercentage = 50, metric = "completion_rate", maxExecutions = 100 } = config;

  // Validierung: Beide Teams müssen dem User gehören
  const [teamA, teamB] = await Promise.all([
    prisma.agentTeam.findFirst({ where: { id: teamAId, userId } }),
    prisma.agentTeam.findFirst({ where: { id: teamBId, userId } }),
  ]);

  if (!teamA) throw new Error("Team A not found");
  if (!teamB) throw new Error("Team B not found");
  if (teamAId === teamBId) throw new Error("Teams must be different");

  return prisma.teamABTest.create({
    data: {
      userId,
      name,
      teamAId,
      teamBId,
      splitPercentage: Math.max(1, Math.min(99, splitPercentage)),
      metric,
      maxExecutions,
      status: TeamABTestStatus.RUNNING,
    },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
  });
}

// Route eine Execution zu Team A oder B
export async function routeExecution(testId: string) {
  const test = await prisma.teamABTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("Test not found");
  if (test.status !== "RUNNING") throw new Error("Test is not running");
  if (test.currentExecutions >= test.maxExecutions) throw new Error("Max executions reached");

  // Zufällige Zuweisung basierend auf Split
  const rand = Math.random() * 100;
  const assignedTeam: "A" | "B" = rand < test.splitPercentage ? "A" : "B";
  const teamId = assignedTeam === "A" ? test.teamAId : test.teamBId;

  return { assignedTeam, teamId, testId };
}

// Ergebnis nach einer Execution speichern
export async function recordABTestResult(
  testId: string,
  teamExecutionId: string,
  team: "A" | "B",
  data: { input?: unknown; result?: string; status: string; cost?: number; durationMs?: number }
) {
  const test = await prisma.teamABTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("Test not found");

  const result = await prisma.teamABTestResult.create({
    data: {
      testId,
      teamExecutionId,
      team,
      input: data.input as object ?? undefined,
      result: data.result,
      status: data.status,
      cost: data.cost,
      durationMs: data.durationMs,
    },
  });

  // Counter aktualisieren + Auto-Complete
  const newCount = test.currentExecutions + 1;
  const updates: Record<string, unknown> = { currentExecutions: newCount };

  if (newCount >= test.maxExecutions) {
    updates.status = TeamABTestStatus.COMPLETED;
    updates.completedAt = new Date();
  }

  await prisma.teamABTest.update({
    where: { id: testId },
    data: updates,
  });

  return result;
}

// Ergebnisse beider Teams vergleichen
export async function getTestResults(testId: string): Promise<ABTestResults> {
  const results = await prisma.teamABTestResult.findMany({
    where: { testId },
    orderBy: { createdAt: "asc" },
  });

  const test = await prisma.teamABTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("Test not found");

  const statsA = computeStats(results.filter((r) => r.team === "A"));
  const statsB = computeStats(results.filter((r) => r.team === "B"));

  const { winner, confidence } = determineWinner(statsA, statsB, test.metric);

  return { teamA: statsA, teamB: statsB, winner, confidence, metric: test.metric };
}

function computeStats(results: { status: string; cost: number | null; durationMs: number | null }[]): ABTestTeamStats {
  const executions = results.length;
  const completed = results.filter((r) => r.status === "COMPLETED" || r.status === "PARTIAL").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  const completedResults = results.filter((r) => r.status === "COMPLETED" || r.status === "PARTIAL");
  const costs = completedResults.map((r) => r.cost ?? 0);
  const durations = completedResults.map((r) => r.durationMs ?? 0);

  return {
    executions,
    completed,
    failed,
    avgCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
    avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    successRate: executions > 0 ? completed / executions : 0,
    totalCost: costs.reduce((a, b) => a + b, 0),
  };
}

function determineWinner(
  statsA: ABTestTeamStats,
  statsB: ABTestTeamStats,
  metric: string
): { winner: "A" | "B" | "TIE" | "INSUFFICIENT_DATA"; confidence: number } {
  const minSamples = 5;
  if (statsA.executions < minSamples || statsB.executions < minSamples) {
    return { winner: "INSUFFICIENT_DATA", confidence: 0 };
  }

  let valueA: number;
  let valueB: number;
  let higherIsBetter: boolean;

  switch (metric) {
    case "cost":
      valueA = statsA.avgCost;
      valueB = statsB.avgCost;
      higherIsBetter = false; // Weniger Kosten = besser
      break;
    case "speed":
      valueA = statsA.avgDurationMs;
      valueB = statsB.avgDurationMs;
      higherIsBetter = false; // Schneller = besser
      break;
    case "lead_quality":
    case "completion_rate":
    default:
      valueA = statsA.successRate;
      valueB = statsB.successRate;
      higherIsBetter = true;
      break;
  }

  if (valueA === valueB) {
    return { winner: "TIE", confidence: 0.5 };
  }

  // Einfache Konfidenz-Berechnung basierend auf Stichprobengröße + Differenz
  const totalSamples = statsA.executions + statsB.executions;
  const diff = Math.abs(valueA - valueB);
  const maxVal = Math.max(Math.abs(valueA), Math.abs(valueB), 0.001);
  const relativeDiff = diff / maxVal;

  // Konfidenz steigt mit Stichprobengröße und relativer Differenz
  const sampleConfidence = Math.min(totalSamples / 100, 1);
  const diffConfidence = Math.min(relativeDiff * 3, 1);
  const confidence = Math.round((sampleConfidence * 0.4 + diffConfidence * 0.6) * 100) / 100;

  const aIsBetter = higherIsBetter ? valueA > valueB : valueA < valueB;
  return { winner: aIsBetter ? "A" : "B", confidence };
}
