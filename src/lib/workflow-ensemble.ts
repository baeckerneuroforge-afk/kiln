export type EnsembleStrategy = "majority_vote" | "best_of" | "average_score";

export interface EnsembleCandidate {
  agentId: string;
  output: string;
  weight?: number;
  score?: number;
}

export interface EnsembleResolution {
  output: string;
  winningAgentId: string | null;
  scores: Record<string, number>;
  strategy: EnsembleStrategy;
}

function normalizeOutput(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveMajorityVote(candidates: EnsembleCandidate[]): EnsembleResolution {
  const buckets = new Map<string, { output: string; score: number; agentId: string }>();

  for (const candidate of candidates) {
    const key = normalizeOutput(candidate.output);
    const bucket = buckets.get(key) || {
      output: candidate.output,
      score: 0,
      agentId: candidate.agentId,
    };
    bucket.score += candidate.weight ?? 1;
    buckets.set(key, bucket);
  }

  const winner = Array.from(buckets.values()).sort((a, b) => b.score - a.score)[0];
  return {
    output: winner?.output || "",
    winningAgentId: winner?.agentId || null,
    scores: Object.fromEntries(Array.from(buckets.entries()).map(([key, bucket]) => [key, bucket.score])),
    strategy: "majority_vote",
  };
}

export function resolveBestOf(candidates: EnsembleCandidate[]): EnsembleResolution {
  const ranked = [...candidates].sort((a, b) => {
    const scoreDelta = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    const weightDelta = (b.weight ?? 1) - (a.weight ?? 1);
    if (weightDelta !== 0) return weightDelta;
    return b.output.length - a.output.length;
  });
  const winner = ranked[0];

  return {
    output: winner?.output || "",
    winningAgentId: winner?.agentId || null,
    scores: Object.fromEntries(candidates.map((candidate) => [
      candidate.agentId,
      candidate.score ?? candidate.weight ?? candidate.output.length,
    ])),
    strategy: "best_of",
  };
}

export function resolveAverageScore(candidates: EnsembleCandidate[]): EnsembleResolution {
  if (candidates.length === 0) {
    return { output: "", winningAgentId: null, scores: {}, strategy: "average_score" };
  }

  const avg =
    candidates.reduce((sum, candidate) => sum + (candidate.score ?? 0) * (candidate.weight ?? 1), 0) /
    candidates.reduce((sum, candidate) => sum + (candidate.weight ?? 1), 0);
  const winner = [...candidates].sort((a, b) => {
    const aDistance = Math.abs((a.score ?? 0) - avg);
    const bDistance = Math.abs((b.score ?? 0) - avg);
    return aDistance - bDistance;
  })[0];

  return {
    output: winner?.output || "",
    winningAgentId: winner?.agentId || null,
    scores: {
      average: avg,
      ...Object.fromEntries(candidates.map((candidate) => [candidate.agentId, candidate.score ?? 0])),
    },
    strategy: "average_score",
  };
}

export function resolveEnsemble(
  candidates: EnsembleCandidate[],
  strategy: EnsembleStrategy
): EnsembleResolution {
  if (strategy === "best_of") return resolveBestOf(candidates);
  if (strategy === "average_score") return resolveAverageScore(candidates);
  return resolveMajorityVote(candidates);
}
