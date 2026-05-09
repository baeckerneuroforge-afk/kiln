export interface CitationCheckResult {
  hasCitations: boolean;
  hallucinations: string[];
}

export async function checkCitations(
  output: string,
  knowledgeBaseChunks: string[],
): Promise<CitationCheckResult> {
  if (knowledgeBaseChunks.length === 0) {
    return { hasCitations: false, hallucinations: extractClaims(output).slice(0, 5) };
  }

  const claims = extractClaims(output);
  const hasCitations = /\[(?:\d+|source[:\s][^\]]+)\]/i.test(output);
  const hallucinations = claims.filter((claim) => !isSupportedClaim(claim, knowledgeBaseChunks));

  return { hasCitations, hallucinations };
}

export async function validateCitationsIfRequired(args: {
  output: string;
  requireCitations?: boolean;
  knowledgeBaseChunks?: string[];
}): Promise<CitationCheckResult> {
  if (!args.requireCitations) {
    return { hasCitations: true, hallucinations: [] };
  }
  return checkCitations(args.output, args.knowledgeBaseChunks ?? []);
}

function extractClaims(output: string): string[] {
  return output
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30)
    .filter((sentence) => !/^#+\s/.test(sentence))
    .slice(0, 20);
}

function isSupportedClaim(claim: string, chunks: string[]): boolean {
  const claimTokens = significantTokens(claim);
  if (claimTokens.length === 0) return true;
  return chunks.some((chunk) => {
    const chunkTokens = new Set(significantTokens(chunk));
    const overlap = claimTokens.filter((token) => chunkTokens.has(token)).length;
    return overlap >= Math.min(4, Math.ceil(claimTokens.length * 0.35));
  });
}

function significantTokens(text: string): string[] {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "are",
    "was",
    "were",
    "ein",
    "eine",
    "und",
    "oder",
    "der",
    "die",
    "das",
    "mit",
    "ist",
    "sind",
  ]);
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !stopwords.has(token))
    .slice(0, 40);
}
