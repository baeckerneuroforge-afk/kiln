/**
 * Cached version of the schema-flow computation for workflow edges.
 *
 * The computation is pure on (sourceType, targetType, mappingCount), so
 * memoizing globally avoids recomputing the same thing every render.
 * The cache is bounded — when it grows past MAX_ENTRIES we drop the
 * oldest entries. Workflows with hundreds of edges of varying types are
 * unrealistic in practice; the bound is just a safety valve.
 *
 * Pulled into its own file (a) so visual-team-editor stays focused on
 * rendering, and (b) so the cache behaviour can be unit-tested
 * independently of ReactFlow.
 */

const TARGETS_NEEDING_INPUT = new Set<string>([
  "agent",
  "llm_prompt",
  "http_request",
  "send_email",
  "send_slack",
  "transform",
  "filter",
  "if_condition",
  "switch",
  "approval_gate",
  "sub_workflow",
  "ai_summarize",
  "ai_classify",
  "ai_extract",
  "google_sheets_write",
  "gmail_send",
  "slack_send_integration",
  "notion_create",
  "airtable_create",
  "data_query",
  "a2a_call",
]);

// Source node types that don't really produce structured output worth
// mapping. Triggers fire with whatever payload they receive; delay
// emits time elapsed; merge passes through. These are exempt.
const PASSTHROUGH_SOURCES = new Set<string>([
  "trigger_webhook",
  "trigger_schedule",
  "trigger_lead",
  "trigger_chat",
  "trigger_manual",
  "delay",
  "set_variable",
  "merge",
  "parallel_merge",
  "wait_webhook",
  "wait_form",
]);

export interface SchemaFlowResult {
  schemaMismatch: boolean;
  dataLabel: string | undefined;
}

const MAX_ENTRIES = 256;
const cache = new Map<string, SchemaFlowResult>();

function makeKey(sourceType: string | undefined, targetType: string | undefined, mappingCount: number): string {
  return `${sourceType ?? "_"}|${targetType ?? "_"}|${mappingCount}`;
}

/**
 * Cached entry-point for visual-team-editor. Returns the same object
 * reference for repeat calls with identical inputs — useful when
 * downstream code depends on referential equality (React.memo etc.).
 */
export function getCachedSchemaFlow(
  sourceType: string | undefined,
  targetType: string | undefined,
  mappingCount: number,
): SchemaFlowResult {
  const key = makeKey(sourceType, targetType, mappingCount);
  const hit = cache.get(key);
  if (hit) return hit;

  const value = computeSchemaFlow(sourceType, targetType, mappingCount);

  // Bounded cache: when full, drop the oldest insert. Map preserves
  // insertion order so iterator.next() gives the oldest key.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/**
 * Pure computation extracted so it can be tested without the cache.
 * Mirrors visual-team-editor's previous inline implementation.
 */
export function computeSchemaFlow(
  sourceType: string | undefined,
  targetType: string | undefined,
  mappingCount: number,
): SchemaFlowResult {
  if (!sourceType || !targetType) {
    return { schemaMismatch: false, dataLabel: undefined };
  }
  if (mappingCount > 0) {
    return {
      schemaMismatch: false,
      dataLabel: mappingCount === 1 ? "1 field mapped" : `${mappingCount} fields mapped`,
    };
  }
  if (TARGETS_NEEDING_INPUT.has(targetType) && !PASSTHROUGH_SOURCES.has(sourceType)) {
    return { schemaMismatch: true, dataLabel: "no mapping" };
  }
  return { schemaMismatch: false, dataLabel: undefined };
}

// Test/dev only — clear the cache for deterministic tests.
export function __resetSchemaFlowCacheForTests(): void {
  cache.clear();
}

export function __schemaFlowCacheSize(): number {
  return cache.size;
}
