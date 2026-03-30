export type AgentSpecializationId =
  | "price_extractor"
  | "researcher"
  | "data_analyst"
  | "synthesizer"
  | "monitor";

export type SpecializationTool =
  | "computer_use"
  | "code_sandbox"
  | "mcp"
  | "deep_research"
  | "web_search";

export type ToolRoutingMode =
  | "dom_first"
  | "vision"
  | "search_then_fetch"
  | "authenticated_browser"
  | "sandbox_analysis"
  | "knowledge_plus_search";

export interface ToolRoutingDecision {
  primaryTool: SpecializationTool;
  supportingTools: SpecializationTool[];
  mode: ToolRoutingMode;
  reason: string;
  requiresVision: boolean;
  requiresLogin: boolean;
}

export interface AgentSpecialization {
  id: AgentSpecializationId;
  label: string;
  systemPrompt: string;
  defaultTools: SpecializationTool[];
  preferredModel: "claude-haiku-4-5-20251001" | "claude-sonnet-4-6";
  maxIterations: number;
  successCriteria: string;
}

export const AGENT_SPECIALIZATIONS: Record<AgentSpecializationId, AgentSpecialization> = {
  price_extractor: {
    id: "price_extractor",
    label: "Price Extractor",
    systemPrompt: `You extract prices. Your FIRST action must be a tool call — never start with reasoning.

RULES:
1. IMMEDIATELY use fetch_url on the official pricing page (e.g. stripe.com/pricing, github.com/pricing)
2. Use web_search ONLY if you don't know the URL
3. Write to workspace using workspace_write as JSON:
{"product":"Name","price":499.99,"currency":"EUR","availability":"In Stock","url":"source URL","variants":[{"name":"...","price":99}]}
4. NEVER guess prices. If not found: {"error":"Price not found","reason":"..."}`,
    defaultTools: ["computer_use", "web_search"],
    preferredModel: "claude-haiku-4-5-20251001",
    maxIterations: 12,
    successCriteria: "Return a populated price field with numeric value, currency, and source URL.",
  },
  researcher: {
    id: "researcher",
    label: "Researcher",
    systemPrompt: `You research the assigned topic. Your FIRST action must be a tool call — never start with reasoning.

RULES:
1. IMMEDIATELY use fetch_url on the official website (e.g. asana.com/pricing for Asana, stripe.com/pricing for Stripe)
2. Use web_search ONLY if you don't know the URL or need reviews/third-party data
3. Use fetch_url on at least 2 pages before writing results
4. Write findings to workspace using workspace_write as JSON:
{"entity":"Name","pricing":{"free":"...","pro":"$X/mo"},"key_features":["..."],"limitations":["..."],"sources":[{"url":"...","title":"..."}]}
5. Every fact needs a source URL. If not found, write "not found" — NEVER guess or use training data.`,
    defaultTools: ["web_search"],
    preferredModel: "claude-haiku-4-5-20251001",
    maxIterations: 15,
    successCriteria: "Return structured data with at least 2 source URLs, pricing info, and key features.",
  },
  data_analyst: {
    id: "data_analyst",
    label: "Data Analyst",
    systemPrompt: `You are a data analysis specialist. Analyze structured data quantitatively.

ANALYSIS PROTOCOL:
1. Parse the input data into structured format
2. Calculate: averages, ranges, rankings, percentages, trends
3. Identify outliers and patterns
4. Generate comparison metrics

OUTPUT: Write structured analysis with numbers, not vague statements. Include methodology.`,
    defaultTools: ["code_sandbox"],
    preferredModel: "claude-sonnet-4-6",
    maxIterations: 5,
    successCriteria: "Return numerical comparisons, rankings, or computed insights.",
  },
  synthesizer: {
    id: "synthesizer",
    label: "Synthesizer",
    systemPrompt: "You are a synthesis specialist. Combine findings from multiple agents into a coherent, source-preserving report with recommendations and limitations.",
    defaultTools: ["code_sandbox"],
    preferredModel: "claude-sonnet-4-6",
    maxIterations: 3,
    successCriteria: "Return a structured report with executive summary, limitations, and preserved citations.",
  },
  monitor: {
    id: "monitor",
    label: "Monitor",
    systemPrompt: `You are a monitoring specialist. Determine what changed compared with previous data.

PROTOCOL:
1. Fetch the current state of the target using web_search or fetch_url
2. Compare with the provided previous state
3. Report ONLY verified differences with evidence
4. If nothing changed, state that clearly

OUTPUT: { "changes": [...], "unchanged": [...], "checked_at": "ISO timestamp", "source": "URL" }`,
    defaultTools: ["computer_use", "web_search"],
    preferredModel: "claude-haiku-4-5-20251001",
    maxIterations: 8,
    successCriteria: "Return a clear change or no-change determination with evidence.",
  },
};

export function resolveSpecialization(
  description: string,
  tools: SpecializationTool[] = [],
  taskType?: string,
  outputFormat?: string
): AgentSpecialization {
  const lower = description.toLowerCase();
  const inferred = taskType?.toLowerCase() || "";

  if (/\bprice|pricing|availability|stock|shipping|coupon\b/.test(lower) || inferred === "comparison") {
    return AGENT_SPECIALIZATIONS.price_extractor;
  }

  if (tools.includes("code_sandbox") && (/\banaly[sz]e|calculate|ranking|statistics|trend|pattern\b/.test(lower) || inferred === "analysis")) {
    return AGENT_SPECIALIZATIONS.data_analyst;
  }

  if (/\bmonitor|change|difference|delta|refresh|recheck|update\b/.test(lower) || inferred === "monitoring") {
    return AGENT_SPECIALIZATIONS.monitor;
  }

  if (outputFormat === "file" || /\bsynthesi[sz]e|merge|combine|report|summary|recommendation\b/.test(lower)) {
    return AGENT_SPECIALIZATIONS.synthesizer;
  }

  return AGENT_SPECIALIZATIONS.researcher;
}

export function decideToolRouting(
  description: string,
  tools: SpecializationTool[] = []
): ToolRoutingDecision | undefined {
  const lower = description.toLowerCase();
  const available = new Set(tools);

  const hasSpecificSite = /\bhttps?:\/\/|\b[a-z0-9-]+\.(?:com|de|io|net|org|co\.uk)\b/.test(lower);
  const asksStructuredWebData = /\bprice|availability|stock|shipping|spec|product|sku\b/.test(lower);
  const requiresAuth = /\blogin|sign in|account|portal|dashboard|authenticated\b/.test(lower);
  const visual = /\bvisual|design|layout|chart|image|screenshot|look like\b/.test(lower);
  const publicResearch = /\bresearch|find out|latest|news|market|compare\b/.test(lower);
  const dataTask = /\bcsv|spreadsheet|excel|table|analy[sz]e data|graph|calculate\b/.test(lower);

  if (dataTask && available.has("code_sandbox")) {
    return {
      primaryTool: "code_sandbox",
      supportingTools: available.has("web_search") ? ["web_search"] : [],
      mode: "sandbox_analysis",
      reason: "The task is primarily data processing or file generation.",
      requiresVision: false,
      requiresLogin: false,
    };
  }

  if (asksStructuredWebData && hasSpecificSite && available.has("computer_use")) {
    return {
      primaryTool: "computer_use",
      supportingTools: available.has("web_search") ? ["web_search"] : [],
      mode: "dom_first",
      reason: "The task needs structured information from a specific site.",
      requiresVision: false,
      requiresLogin: false,
    };
  }

  if (requiresAuth && available.has("computer_use")) {
    return {
      primaryTool: "computer_use",
      supportingTools: [],
      mode: "authenticated_browser",
      reason: "The task requires a site-specific authenticated browser flow.",
      requiresVision: false,
      requiresLogin: true,
    };
  }

  if (visual && available.has("computer_use")) {
    return {
      primaryTool: "computer_use",
      supportingTools: available.has("web_search") ? ["web_search"] : [],
      mode: "vision",
      reason: "The task needs visual inspection of a rendered page.",
      requiresVision: true,
      requiresLogin: false,
    };
  }

  if (publicResearch && available.has("web_search")) {
    return {
      primaryTool: "web_search",
      supportingTools: available.has("deep_research") ? ["deep_research"] : [],
      mode: "search_then_fetch",
      reason: "The task is broad public research where search plus fetch is the cheapest effective route.",
      requiresVision: false,
      requiresLogin: false,
    };
  }

  if (available.has("web_search")) {
    return {
      primaryTool: "web_search",
      supportingTools: [],
      mode: "knowledge_plus_search",
      reason: "Fallback to public search plus model reasoning.",
      requiresVision: false,
      requiresLogin: false,
    };
  }

  return undefined;
}
