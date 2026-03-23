/**
 * Sub-Agent Executor
 * Führt einen einzelnen Sub-Task mit vollem Tool-Zugriff aus (ReAct-Pattern).
 * Jeder Sub-Agent kann browsen, Code ausführen, MCP-Tools nutzen und andere Agents spawnen.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SharedWorkspace } from "./shared-workspace";
import { SwarmEventStream } from "./swarm-event-stream";
import {
  ErrorStrategyLibrary,
  detectErrorType,
} from "./error-strategies";
import { CostTracker } from "@/lib/cost/cost-tracker";
import {
  selectOptimalModel,
  detectTaskType,
  type ModelRoutingContext,
} from "@/lib/smart-model-router";
import { ReasoningLogger } from "@/lib/sandbox/reasoning-logger";
import { ElementFinder } from "@/lib/browser/element-finder";
import { ActionExecutor } from "@/lib/browser/action-executor";
import type { BrowserSession } from "@/lib/browser-service";
// DomVerifier wird indirekt via ActionExecutor/ElementFinder genutzt
import { ScreenshotStrategy } from "@/lib/browser/screenshot-strategy";
import { PageCache, type PageStructure } from "@/lib/browser/page-cache";

/* ── Types ── */

export type SubAgentTool =
  | "computer_use"
  | "code_sandbox"
  | "mcp"
  | "deep_research"
  | "web_search";

export type ModelPreference =
  | "fast_extraction"
  | "research"
  | "code_generation"
  | "deep_reasoning"
  | "creative";

export interface SubAgentConfig {
  id: string;
  description: string;
  tools: SubAgentTool[];
  modelPreference?: ModelPreference;
  estimatedComplexity?: "low" | "medium" | "high";
  outputFormat?: "text" | "json" | "table" | "file";
  maxIterations?: number;
  budgetCredits?: number;
  parentAgentId?: string; // für dynamisch gespawnte Agents
}

export interface SubAgentArtifact {
  type: "text" | "json" | "file" | "screenshot";
  name: string;
  content: unknown;
}

export interface SubAgentResult {
  id: string;
  result: string;
  toolCallsCount: number;
  tokensUsed: { input: number; output: number };
  modelUsed: string;
  cost: number;
  artifacts: SubAgentArtifact[];
  stoppedReason?: "completed" | "budget_exceeded" | "max_iterations" | "error";
}

export interface SpawnRequest {
  task: string;
  tools: SubAgentTool[];
  priority?: "low" | "normal" | "high";
}

export type SpawnHandler = (request: SpawnRequest, parentId: string) => void;

const subAgentBrowserSessions = new Map<string, BrowserSession>();

async function getOrCreateSubAgentBrowserSession(agentId: string): Promise<BrowserSession | null> {
  const existing = subAgentBrowserSessions.get(agentId);
  if (existing && existing.status === "active") {
    return existing;
  }

  const { isBrowserServiceAvailable, createBrowserSession } = await import("@/lib/browser-service");
  if (!isBrowserServiceAvailable()) {
    return null;
  }

  const session = await createBrowserSession();
  subAgentBrowserSessions.set(agentId, session);
  return session;
}

async function cleanupSubAgentBrowserSession(agentId: string): Promise<void> {
  const session = subAgentBrowserSessions.get(agentId);
  if (!session) return;

  const { closeBrowserSession } = await import("@/lib/browser-service");
  await closeBrowserSession(session.id).catch(() => {});
  subAgentBrowserSessions.delete(agentId);
}

/* ── Model Preference → Routing Context Mapping ── */

function preferenceToRoutingContext(pref: ModelPreference, complexity: string): ModelRoutingContext {
  switch (pref) {
    case "fast_extraction":
      return { taskType: "data_extraction", budget: "low", complexity: "simple" };
    case "research":
      return { taskType: "research", budget: "medium", complexity: complexity as "simple" | "medium" | "complex" };
    case "code_generation":
      return { taskType: "code_generation", budget: "medium", complexity: complexity as "simple" | "medium" | "complex" };
    case "deep_reasoning":
      return { taskType: "general", budget: "high", complexity: "complex" };
    case "creative":
      return { taskType: "creative_writing", budget: "medium", complexity: complexity as "simple" | "medium" | "complex" };
    default:
      return { taskType: "general", budget: "medium", complexity: "medium" };
  }
}

/* ── Tool Definitions Builder ── */

function buildToolDefinitions(tools: SubAgentTool[], enableSpawn: boolean): Anthropic.Tool[] {
  const defs: Anthropic.Tool[] = [];

  // Workspace-Tools (immer verfügbar)
  defs.push({
    name: "workspace_write",
    description: "Write a finding to the shared workspace so other agents can see it. Use this whenever you discover important information.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Short identifier for this finding (e.g., 'sonepar_price', 'competitor_list')" },
        value: { type: "string", description: "The finding content — be detailed and specific" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
      },
      required: ["key", "value"],
    },
  });

  defs.push({
    name: "workspace_read",
    description: "Read findings from the shared workspace written by other agents. Use this to check what others have found.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Specific key to read, or omit to read all findings" },
      },
      required: [],
    },
  });

  defs.push({
    name: "send_message",
    description: "Send a message to another agent or broadcast to all agents. Use when you discover something that should change another agent's approach.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Target agent ID, or '*' to broadcast to all" },
        message: { type: "string", description: "The message content" },
      },
      required: ["to", "message"],
    },
  });

  if (tools.includes("computer_use")) {
    defs.push({
      name: "browse_url",
      description: "Navigate to a URL and get the page content. Use for web browsing, checking websites, and extracting information from web pages.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "The URL to navigate to" },
          extract_fields: { type: "array", items: { type: "string" }, description: "Specific fields to extract from the page" },
        },
        required: ["url"],
      },
    });

    defs.push({
      name: "take_screenshot",
      description: "Take a screenshot of the current browser page for visual analysis.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "URL to screenshot (uses current page if omitted)" },
        },
        required: [],
      },
    });

    defs.push({
      name: "click_element",
      description: "Click an element on the current web page by CSS selector or text content.",
      input_schema: {
        type: "object" as const,
        properties: {
          selector: { type: "string", description: "CSS selector or text content of the element to click" },
        },
        required: ["selector"],
      },
    });

    defs.push({
      name: "type_text",
      description: "Type text into an input field on the current web page.",
      input_schema: {
        type: "object" as const,
        properties: {
          selector: { type: "string", description: "CSS selector of the input field" },
          text: { type: "string", description: "Text to type" },
        },
        required: ["selector", "text"],
      },
    });

    defs.push({
      name: "scroll_page",
      description: "Scroll the current web page up or down.",
      input_schema: {
        type: "object" as const,
        properties: {
          direction: { type: "string", enum: ["up", "down"], description: "Scroll direction" },
          pixels: { type: "number", description: "Pixels to scroll (default: 500)" },
        },
        required: ["direction"],
      },
    });
  }

  if (tools.includes("code_sandbox")) {
    defs.push({
      name: "execute_python",
      description: "Execute Python code in a secure sandbox. Use for data processing, calculations, file creation, and analysis.",
      input_schema: {
        type: "object" as const,
        properties: {
          code: { type: "string", description: "Python code to execute" },
        },
        required: ["code"],
      },
    });

    defs.push({
      name: "execute_javascript",
      description: "Execute JavaScript/Node.js code in a secure sandbox.",
      input_schema: {
        type: "object" as const,
        properties: {
          code: { type: "string", description: "JavaScript code to execute" },
        },
        required: ["code"],
      },
    });
  }

  if (tools.includes("deep_research") || tools.includes("web_search")) {
    defs.push({
      name: "web_search",
      description: "Search the web for information. Returns search results with titles, URLs, and snippets.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query" },
          num_results: { type: "number", description: "Number of results (default: 5, max: 10)" },
        },
        required: ["query"],
      },
    });

    defs.push({
      name: "fetch_url",
      description: "Fetch the text content of a URL. Use for reading articles, documentation, or any web page.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "URL to fetch" },
        },
        required: ["url"],
      },
    });
  }

  if (enableSpawn) {
    defs.push({
      name: "spawn_sub_agent",
      description: "Spawn a new sub-agent to handle a specific sub-task in parallel. Use when you realize a task needs to be split further. Max 3 spawns per agent.",
      input_schema: {
        type: "object" as const,
        properties: {
          task: { type: "string", description: "What the new agent should do" },
          tools: {
            type: "array",
            items: { type: "string", enum: ["computer_use", "code_sandbox", "mcp", "deep_research", "web_search"] },
            description: "Tools the new agent needs",
          },
          priority: { type: "string", enum: ["low", "normal", "high"], description: "Execution priority" },
        },
        required: ["task", "tools"],
      },
    });
  }

  return defs;
}

/* ── Tool Executor ── */

async function executeSubAgentTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  workspace: SharedWorkspace,
  eventStream: SwarmEventStream,
  parentAgentId: string | undefined,
  spawnHandler: SpawnHandler | undefined,
  spawnCount: { current: number },
  mcpAgentId?: string,
): Promise<string> {
  switch (toolName) {
    case "workspace_write": {
      const key = String(toolInput.key || "");
      const value = toolInput.value;
      const tags = Array.isArray(toolInput.tags) ? toolInput.tags.map(String) : [];
      workspace.write(agentId, key, value, tags);
      eventStream.agentFinding(agentId, key, value);
      return JSON.stringify({ success: true, message: `Finding '${key}' written to workspace` });
    }

    case "workspace_read": {
      const key = toolInput.key ? String(toolInput.key) : undefined;
      const entries = workspace.read(key);
      return JSON.stringify({
        success: true,
        findings: entries.map((e) => ({ agent: e.agentId, key: e.key, value: e.value, time: e.timestamp })),
      });
    }

    case "send_message": {
      const to = String(toolInput.to || "*");
      const message = String(toolInput.message || "");
      if (to === "*") {
        workspace.broadcast(agentId, message);
      } else {
        workspace.sendMessage(agentId, to, message);
      }
      eventStream.agentMessage(agentId, to, message);
      return JSON.stringify({ success: true, message: `Message sent to ${to}` });
    }

    case "browse_url": {
      try {
        const url = String(toolInput.url || "");
        const browserSession = await getOrCreateSubAgentBrowserSession(agentId);
        let html = "";
        let browserWarning: string | undefined;

        if (browserSession) {
          const { navigateTo } = await import("@/lib/browser-service");
          const navResult = await navigateTo(browserSession, url, { timeout: 30000 });
          html = navResult.content;
          browserWarning = browserSession.warning;
        } else {
          const { safeFetch } = await import("@/lib/url-validation");
          const response = await safeFetch(url, { signal: AbortSignal.timeout(15000) });
          if (!response.ok) {
            return JSON.stringify({ success: false, error: `HTTP ${response.status}` });
          }
          html = await response.text();
          browserWarning = "Running in limited HTTP mode for this sub-agent.";
        }

        // Extrahiere sinnvollen Text (ohne Tags)
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);

        // PageCache: cache page structure for faster repeat visits
        let cachedStructure: PageStructure | undefined;
        try {
          const pageCache = new PageCache();
          cachedStructure = pageCache.getCachedStructure(url) || undefined;
          if (!cachedStructure) {
            // Einfache Struktur-Extraktion für Cache
            const forms = (html.match(/<form[^>]*>/gi) || []).length;
            const buttons = (html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [])
              .slice(0, 10)
              .map(b => b.replace(/<[^>]+>/g, "").trim());
            if (forms > 0 || buttons.length > 0) {
              const structure: PageStructure = {
                forms: [],
                buttons: buttons.map(b => ({ selector: "", text: b })),
                links: [],
                tables: (html.match(/<table/gi) || []).length,
                prices: [],
                navigation: [],
              };
              pageCache.cachePage(url, structure);
            }
          }
        } catch {
          // PageCache ist optional
        }

        const result: Record<string, unknown> = { success: true, url, content: text };
        if (browserSession) {
          result.browserBackend = browserSession.backend;
        }
        if (browserWarning) {
          result.warning = browserWarning;
        }
        if (cachedStructure) {
          result.pageStructure = {
            forms: cachedStructure.forms.length,
            buttons: cachedStructure.buttons.map(b => b.text).slice(0, 5),
            tables: cachedStructure.tables,
            hasSearch: !!cachedStructure.searchField,
            hasLogin: !!cachedStructure.loginForm,
          };
        }
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Browse failed" });
      }
    }

    case "take_screenshot": {
      try {
        const url = toolInput.url ? String(toolInput.url) : undefined;
        const browserSession = await getOrCreateSubAgentBrowserSession(agentId);

        if (browserSession) {
          const { takeBrowserScreenshot } = await import("@/lib/browser-service");
          const screenshot = await takeBrowserScreenshot(browserSession, url);
          return JSON.stringify({
            success: !!screenshot,
            screenshot: screenshot ? "screenshot_captured" : "screenshot_unavailable",
            backend: browserSession.backend,
            warning: browserSession.warning,
          });
        }

        const { takeScreenshot } = await import("@/lib/screenshot-service");
        if (!url) return JSON.stringify({ success: false, error: "URL required for screenshot" });

        // Prüfe ob Screenshot nötig ist (ScreenshotStrategy)
        const strategy = new ScreenshotStrategy();
        const decision = strategy.shouldTakeScreenshot("navigate");

        const screenshot = await takeScreenshot(url);
        return JSON.stringify({
          success: true,
          screenshot: screenshot ? "screenshot_captured" : "screenshot_unavailable",
          strategyReason: decision.reason,
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Screenshot failed" });
      }
    }

    case "click_element": {
      try {
        const selector = String(toolInput.selector || "");
        const session = await getOrCreateSubAgentBrowserSession(agentId);
        if (!session) {
          return JSON.stringify({
            success: false,
            error: "Browser service not available. Use browse_url for content extraction.",
          });
        }

        const elementFinder = new ElementFinder();
        const actionExecutor = new ActionExecutor(elementFinder);
        const result = await actionExecutor.executeClick(session, "", selector);
        return JSON.stringify({
          success: result.success,
          method: result.methodUsed,
          alternativesTried: result.alternativesTried,
          error: result.error,
          backend: session.backend,
          warning: session.warning,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : "Click failed",
          note: "Use browse_url for navigation in sub-agent context.",
        });
      }
    }

    case "type_text": {
      try {
        const selector = String(toolInput.selector || "");
        const text = String(toolInput.text || "");
        const session = await getOrCreateSubAgentBrowserSession(agentId);
        if (!session) {
          return JSON.stringify({
            success: false,
            error: "Browser service not available.",
          });
        }

        const elementFinder = new ElementFinder();
        const actionExecutor = new ActionExecutor(elementFinder);
        const result = await actionExecutor.executeType(session, "", selector, text);
        return JSON.stringify({
          success: result.success,
          method: result.methodUsed,
          error: result.error,
          backend: session.backend,
          warning: session.warning,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : "Type failed",
        });
      }
    }

    case "scroll_page": {
      try {
        const direction = String(toolInput.direction || "down") as "up" | "down";
        const pixels = Number(toolInput.pixels) || 500;
        const session = await getOrCreateSubAgentBrowserSession(agentId);
        if (!session) {
          return JSON.stringify({ success: true, note: "Scroll noted (no browser session)." });
        }

        const actionExecutor = new ActionExecutor();
        const result = await actionExecutor.executeScroll(session, "", direction, pixels);
        return JSON.stringify({
          success: result.success,
          method: result.methodUsed,
          backend: session.backend,
          warning: session.warning,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : "Scroll failed",
        });
      }
    }

    case "execute_python":
    case "execute_javascript": {
      try {
        const language = toolName === "execute_python" ? "python" : "javascript";
        const code = String(toolInput.code || "");
        const { isCodeSandboxAvailable } = await import("@/lib/sandbox/code-sandbox");
        if (!isCodeSandboxAvailable()) {
          return JSON.stringify({ success: false, error: "Code sandbox not available (E2B_API_KEY not set)" });
        }
        const { executePython, executeJavascript } = await import("@/lib/sandbox/code-tools");
        const execId = `subagent_${Date.now()}`;
        const result = language === "python"
          ? await executePython(execId, code)
          : await executeJavascript(execId, code);
        return JSON.stringify({
          success: result.success,
          output: result.output?.slice(0, 3000),
          error: result.error,
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Code execution failed" });
      }
    }

    case "web_search": {
      try {
        const query = String(toolInput.query || "");
        const numResults = Math.min(Number(toolInput.num_results) || 5, 10);
        // Nutze Perplexity via LLM wenn verfügbar, sonst Fallback
        const { safeFetch } = await import("@/lib/url-validation");
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=${numResults}`;

        if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) {
          const res = await safeFetch(searchUrl, { signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const data = await res.json();
            const items = (data.items || []).map((item: { title: string; link: string; snippet: string }) => ({
              title: item.title, url: item.link, snippet: item.snippet,
            }));
            return JSON.stringify({ success: true, results: items });
          }
        }

        // Fallback: Hinweis dass Suche nicht verfügbar
        return JSON.stringify({
          success: false,
          error: "Web search API not configured. Use browse_url to check specific URLs.",
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Search failed" });
      }
    }

    case "fetch_url": {
      try {
        const { safeFetch } = await import("@/lib/url-validation");
        const url = String(toolInput.url || "");
        const response = await safeFetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await response.text();
        const cleaned = text
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
        return JSON.stringify({ success: true, url, content: cleaned });
      } catch (err) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Fetch failed" });
      }
    }

    case "spawn_sub_agent": {
      if (!spawnHandler) {
        return JSON.stringify({ success: false, error: "Spawning not available" });
      }
      if (spawnCount.current >= 3) {
        return JSON.stringify({ success: false, error: "Max 3 spawns per agent reached" });
      }
      const task = String(toolInput.task || "");
      const tools = Array.isArray(toolInput.tools) ? toolInput.tools as SubAgentTool[] : [];
      const priority = (toolInput.priority as "low" | "normal" | "high") || "normal";
      spawnCount.current++;
      spawnHandler({ task, tools, priority }, agentId);
      eventStream.agentSpawned(agentId, `spawned_${agentId}_${spawnCount.current}`, task);
      return JSON.stringify({ success: true, message: `Sub-agent spawned for: ${task.slice(0, 100)}` });
    }

    default: {
      // MCP Tool Fallthrough
      if (mcpAgentId && toolName.startsWith("mcp__")) {
        try {
          const { executeMCPTool } = await import("@/lib/mcp/mcp-tool-bridge");
          return await executeMCPTool(mcpAgentId, toolName, toolInput);
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : "MCP tool failed" });
        }
      }
      return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
    }
  }
}

/* ── SubAgentExecutor Class ── */

export class SubAgentExecutor {
  private config: SubAgentConfig;
  private costTracker: CostTracker;
  private reasoningLogger: ReasoningLogger;
  private errorLibrary: ErrorStrategyLibrary;
  private spawnHandler?: SpawnHandler;
  private mcpAgentId?: string;

  constructor(
    config: SubAgentConfig,
    costTracker: CostTracker,
    options?: {
      spawnHandler?: SpawnHandler;
      mcpAgentId?: string;
    }
  ) {
    this.config = config;
    this.costTracker = costTracker;
    this.reasoningLogger = new ReasoningLogger();
    this.errorLibrary = new ErrorStrategyLibrary();
    this.spawnHandler = options?.spawnHandler;
    this.mcpAgentId = options?.mcpAgentId;
  }

  /**
   * Führt den Sub-Task mit vollem Tool-Zugriff aus (ReAct Loop).
   */
  async execute(
    workspace: SharedWorkspace,
    eventStream: SwarmEventStream,
    anthropicClient: Anthropic
  ): Promise<SubAgentResult> {
    const maxIterations = this.config.maxIterations || 10;
    const spawnCount = { current: 0 };
    let totalToolCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const artifacts: SubAgentArtifact[] = [];

    // Step 1: Select model via smart-model-router
    const routingContext = this.config.modelPreference
      ? preferenceToRoutingContext(
          this.config.modelPreference,
          this.config.estimatedComplexity || "medium"
        )
      : {
          taskType: detectTaskType(this.config.description),
          budget: this.config.estimatedComplexity === "low" ? "low" as const : "medium" as const,
          complexity: (this.config.estimatedComplexity === "high" ? "complex" : this.config.estimatedComplexity === "low" ? "simple" : "medium") as "simple" | "medium" | "complex",
        };

    const routingDecision = selectOptimalModel(routingContext);
    const model = routingDecision.primary.model;

    eventStream.agentStarted(this.config.id, this.config.description, model, this.config.tools);

    // Step 2: Build tool definitions
    const enableSpawn = !!this.spawnHandler;
    const tools = buildToolDefinitions(this.config.tools, enableSpawn);

    // MCP-Tools hinzufügen wenn verfügbar
    if (this.config.tools.includes("mcp") && this.mcpAgentId) {
      try {
        const { getMCPToolDefinitions } = await import("@/lib/mcp/mcp-tool-bridge");
        const mcpTools = await getMCPToolDefinitions(this.mcpAgentId);
        tools.push(...mcpTools);
      } catch {
        // MCP nicht verfügbar — weiter ohne
      }
    }

    // Step 3: Build system prompt
    const systemPrompt = [
      `You are a specialized sub-agent in a KILN AI Swarm. Your ID is "${this.config.id}".`,
      `Your task: ${this.config.description}`,
      "",
      "IMPORTANT RULES:",
      "- Use workspace_write to save every important finding immediately.",
      "- Use workspace_read to check what other agents have found.",
      "- Use send_message to inform other agents of discoveries that affect their work.",
      "- Be precise, thorough, and efficient.",
      "- When your task is complete, provide a clear final summary.",
      this.config.outputFormat === "json" ? "- Return your final answer as valid JSON." : "",
      this.config.outputFormat === "table" ? "- Format your final answer as a markdown table." : "",
    ].filter(Boolean).join("\n");

    // Step 4: ReAct Loop
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: this.config.description },
    ];

    let stoppedReason: SubAgentResult["stoppedReason"] = "completed";
    let finalResult = "";

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Budget-Check vor jeder Iteration
      if (this.config.budgetCredits) {
        const budget = this.costTracker.checkBudget(this.config.budgetCredits);
        if (!budget.withinBudget) {
          stoppedReason = "budget_exceeded";
          finalResult = finalResult || `Agent stopped: budget exceeded after ${totalToolCalls} tool calls. Partial results available in workspace.`;
          break;
        }
      }

      // Inter-Agent-Messages abholen und prependen
      const pendingMessages = workspace.getMessages(this.config.id);
      if (pendingMessages.length > 0) {
        const msgBlock = pendingMessages
          .map((m) => `[${m.from}]: ${m.message}`)
          .join("\n");
        messages.push({
          role: "user",
          content: `📨 Messages from other agents:\n${msgBlock}\n\nContinue your task, taking these messages into account.`,
        });
      }

      try {
        const response = await anthropicClient.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        // Token-Tracking
        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        await this.costTracker.trackUsage(model, inputTokens, outputTokens, `sub-agent:${this.config.id}:iter${iteration}`);

        // Response verarbeiten
        let hasToolUse = false;
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        let textContent = "";

        for (const block of response.content) {
          if (block.type === "text") {
            textContent += block.text;
          } else if (block.type === "tool_use") {
            hasToolUse = true;
            totalToolCalls++;

            eventStream.agentToolCalled(this.config.id, block.name, block.input as Record<string, unknown>);

            // Tool ausführen
            let toolResult: string;
            try {
              toolResult = await executeSubAgentTool(
                block.name,
                block.input as Record<string, unknown>,
                this.config.id,
                workspace,
                eventStream,
                this.config.parentAgentId,
                this.spawnHandler,
                spawnCount,
                this.mcpAgentId,
              );
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : "Tool execution failed";
              const errorType = detectErrorType(errorMsg);
              const recoveryStep = this.errorLibrary.getNextRecoveryStep(errorType, 0);

              toolResult = JSON.stringify({
                success: false,
                error: errorMsg,
                recovery_hint: recoveryStep?.description || "No recovery available",
              });

              eventStream.agentFailed(this.config.id, `Tool ${block.name} failed: ${errorMsg}`, !!recoveryStep);
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: toolResult,
            });

            // Reasoning loggen
            this.reasoningLogger.log({
              step: iteration,
              observation: `Tool call: ${block.name}`,
              reasoning: `Iteration ${iteration}: called ${block.name}`,
              action: block.name,
              target: JSON.stringify(block.input).slice(0, 200),
              confidence: 0.8,
              alternativesConsidered: [],
              thinkingDurationMs: 0,
            });
          }
        }

        if (!hasToolUse) {
          // Keine Tool-Calls → Agent ist fertig
          finalResult = textContent;
          stoppedReason = "completed";
          break;
        }

        // Tool-Ergebnisse zur Konversation hinzufügen
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });

        // Letzte Iteration: force final answer
        if (iteration === maxIterations - 1) {
          stoppedReason = "max_iterations";
          finalResult = textContent || `Agent reached max iterations (${maxIterations}). Results saved to workspace.`;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "LLM call failed";
        eventStream.agentFailed(this.config.id, errorMsg, false);
        stoppedReason = "error";
        finalResult = `Agent error: ${errorMsg}. Partial results may be in workspace.`;
        break;
      }
    }

    // Kosten-Summary
    const costSummary = this.costTracker.getCostSoFar();
    await cleanupSubAgentBrowserSession(this.config.id);

    eventStream.agentCompleted(this.config.id, finalResult.slice(0, 500), costSummary.totalCostDollars);

    return {
      id: this.config.id,
      result: finalResult,
      toolCallsCount: totalToolCalls,
      tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
      modelUsed: model,
      cost: costSummary.totalCostDollars,
      artifacts,
      stoppedReason,
    };
  }
}
