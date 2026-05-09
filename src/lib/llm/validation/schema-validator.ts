import type { z } from "zod";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function validateOutput<T>(
  content: string,
  schema: z.ZodSchema<T>,
): Promise<ValidationResult<T>> {
  const parsedJson = parseJson(content);
  if (!parsedJson.success) {
    return { success: false, error: parsedJson.error };
  }

  const result = schema.safeParse(parsedJson.data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; "),
  };
}

function parseJson(content: string): ValidationResult<unknown> {
  const trimmed = content.trim();
  const candidates = [
    trimmed,
    extractFencedJson(trimmed),
    extractObjectOrArray(trimmed),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return { success: true, data: JSON.parse(candidate) as unknown };
    } catch {
      // Try next candidate.
    }
  }

  return { success: false, error: "Output is not valid JSON." };
}

function extractFencedJson(content: string): string | null {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match?.[1] ?? null;
}

function extractObjectOrArray(content: string): string | null {
  const firstObject = content.indexOf("{");
  const firstArray = content.indexOf("[");
  const starts: number[] = [firstObject, firstArray].filter((index) => index >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const end = content.lastIndexOf(content[start] === "{" ? "}" : "]");
  return end > start ? content.slice(start, end + 1) : null;
}
