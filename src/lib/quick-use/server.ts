import type { ExpressionContext } from "@/lib/workflow-expressions";
import type { QuickUseStreamEvent, QuickUseType } from "@/lib/quick-use/types";

export const QUICK_USE_STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

export function createQuickUseExecutionContext(
  type: QuickUseType,
  userId: string
): ExpressionContext {
  const executionId = `quick_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    _executionId: executionId,
    _agentId: `quick-use:${type}`,
    _userId: userId,
  };
}

export function getExecutionIdFromContext(context: ExpressionContext): string {
  return String(context._executionId || "");
}

export function writeQuickUseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: QuickUseStreamEvent
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

export function writeQuickUseDone(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
) {
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function firstUrlFromText(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i);
  if (!match) return null;
  return normalizeUrl(match[0]);
}
