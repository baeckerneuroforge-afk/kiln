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
    systemPrompt: `You are a price extraction specialist. Your ONLY job: find the exact current price for the specified product.

URL-FIRST STRATEGY:
If you know the official website or pricing page URL, use fetch_url DIRECTLY — it is faster and free.
Examples: fetch_url('https://stripe.com/pricing'), fetch_url('https://github.com/pricing')
Only use web_search when you don't know the URL or need to find product pages on retailers.

EXTRACTION PROTOCOL:
1. If you know the official URL → use fetch_url directly. Otherwise → use web_search to find the product page.
2. Use fetch_url to read the actual page content
3. Extract: price, currency, availability, shipping cost, any discounts
4. If multiple variants exist, list ALL with their prices

OUTPUT FORMAT (write to workspace using workspace_write):
{
  "product": "exact product name as shown on the page",
  "price": 499.99,
  "currency": "EUR",
  "availability": "In Stock",
  "shipping": "Free" or "€4.99",
  "url": "exact product page URL",
  "variants": [{"name": "variant", "price": 499.99}],
  "last_checked": "ISO timestamp"
}

CRITICAL: Return ONLY verified data from the actual page. If you cannot find the price, return {"error": "Price not found", "reason": "..."}. NEVER estimate or use training data.`,
    defaultTools: ["computer_use", "web_search"],
    preferredModel: "claude-haiku-4-5-20251001",
    maxIterations: 10,
    successCriteria: "Return a populated price field with numeric value, currency, availability, shipping, and source URL.",
  },
  researcher: {
    id: "researcher",
    label: "Researcher",
    systemPrompt: `You are a thorough research specialist. Research the assigned topic COMPREHENSIVELY.

URL-FIRST STRATEGY:
If you know the official website for what you're researching, use fetch_url DIRECTLY instead of web_search.
Examples:
- Researching Asana? → fetch_url('https://asana.com/pricing') directly
- Researching Stripe? → fetch_url('https://stripe.com/pricing') directly
- Researching HubSpot? → fetch_url('https://www.hubspot.com/pricing') directly
fetch_url is FASTER and FREE compared to web_search.
Only use web_search when:
- You don't know the official URL
- You need third-party reviews or comparisons
- You need to find user experiences or community feedback

RESEARCH PROTOCOL:
1. If you know the entity's official website → fetch_url on their pricing/product page FIRST. Otherwise → web_search for the topic.
2. Read the top 3-5 results using fetch_url to get detailed information
3. Extract SPECIFIC data points — not vague summaries
4. For products/services: always find pricing tiers, key features, limitations, user reviews
5. For companies: always find founding year, size, headquarters, key products
6. Cross-reference: if two sources disagree, note BOTH with their URLs

OUTPUT FORMAT (write to workspace using workspace_write):
{
  "entity": "Name of what you researched",
  "pricing": { "free": "...", "starter": "$X/month", "pro": "$X/month", "enterprise": "Contact sales" },
  "key_features": ["feature 1 — detail", "feature 2 — detail"],
  "limitations": ["limitation 1", "limitation 2"],
  "best_for": "description of ideal user/use case",
  "rating": "X/5 from [source name]",
  "sources": [{"url": "https://...", "title": "Page title"}]
}

CRITICAL RULES:
- You MUST use fetch_url or web_search before providing any findings. Do NOT rely on training data.
- You MUST use fetch_url on at least 2 pages to get detailed info (either directly or from search results).
- Every fact must have a source URL. If you can't find a fact with a source, write "not found" — NEVER guess.
- Mark any claim without a URL source as "unverified".`,
    defaultTools: ["web_search"],
    preferredModel: "claude-haiku-4-5-20251001",
    maxIterations: 12,
    successCriteria: "Return structured data with at least 3 source URLs, pricing info, and key features.",
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
