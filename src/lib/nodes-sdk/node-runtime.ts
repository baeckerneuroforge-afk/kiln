/**
 * Custom Node Runtime
 * Fuehrt Custom Nodes in einem eingeschraenkten Kontext aus.
 * Kein Dateisystem-Zugriff — nur ueber Helper-Interfaces.
 */

import { prisma } from "@/lib/prisma";
import { getClaudeClient } from "@/lib/ai";
import type {
  CustomNodeDefinition,
  NodeExecutionContext,
  NodeResult,
  CreditHelper,
  LLMHelper,
  HTTPHelper,
  HTTPResponse,
  StorageHelper,
} from "./node-sdk-types";
import type { ActionNodeResult } from "@/lib/workflow-nodes/action-nodes";

const EXECUTION_TIMEOUT_MS = 60_000; // 60 Sekunden
const HTTP_TIMEOUT_MS = 15_000; // 15 Sekunden fuer HTTP-Requests

/* ── Validierung ── */

function validatePort(port: unknown, label: string): string[] {
  const errors: string[] = [];
  if (!port || typeof port !== "object") {
    errors.push(`${label}: Muss ein Objekt sein`);
    return errors;
  }
  const p = port as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name) errors.push(`${label}: name fehlt`);
  if (!["string", "number", "json", "boolean", "array", "any"].includes(p.type as string)) {
    errors.push(`${label}: Ungueltiger Typ "${String(p.type)}"`);
  }
  if (typeof p.description !== "string") errors.push(`${label}: description fehlt`);
  return errors;
}

function validateConfigField(field: unknown, label: string): string[] {
  const errors: string[] = [];
  if (!field || typeof field !== "object") {
    errors.push(`${label}: Muss ein Objekt sein`);
    return errors;
  }
  const f = field as Record<string, unknown>;
  if (typeof f.name !== "string" || !f.name) errors.push(`${label}: name fehlt`);
  if (!["text", "number", "select", "toggle", "textarea", "password"].includes(f.type as string)) {
    errors.push(`${label}: Ungueltiger Typ "${String(f.type)}"`);
  }
  if (typeof f.label !== "string" || !f.label) errors.push(`${label}: label fehlt`);
  return errors;
}

export function validateDefinition(def: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!def || typeof def !== "object") return { valid: false, errors: ["Definition muss ein Objekt sein"] };

  const d = def as Record<string, unknown>;

  if (typeof d.id !== "string" || !d.id.includes("/")) {
    errors.push("id muss im Format 'creator/node-name' sein");
  }
  if (typeof d.name !== "string" || !d.name) errors.push("name fehlt");
  if (typeof d.description !== "string" || !d.description) errors.push("description fehlt");
  if (typeof d.category !== "string" || !d.category) errors.push("category fehlt");
  if (typeof d.version !== "string" || !d.version) errors.push("version fehlt");
  if (typeof d.executeCode !== "string" || !d.executeCode) errors.push("executeCode fehlt");

  // Semver-Check
  if (typeof d.version === "string" && !/^\d+\.\d+\.\d+$/.test(d.version)) {
    errors.push("version muss im Format x.y.z sein (Semantic Versioning)");
  }

  if (Array.isArray(d.inputs)) {
    (d.inputs as unknown[]).forEach((p, i) => errors.push(...validatePort(p, `inputs[${i}]`)));
  } else {
    errors.push("inputs muss ein Array sein");
  }

  if (Array.isArray(d.outputs)) {
    (d.outputs as unknown[]).forEach((p, i) => errors.push(...validatePort(p, `outputs[${i}]`)));
  } else {
    errors.push("outputs muss ein Array sein");
  }

  if (Array.isArray(d.config)) {
    (d.config as unknown[]).forEach((f, i) => errors.push(...validateConfigField(f, `config[${i}]`)));
  }

  return { valid: errors.length === 0, errors };
}

/* ── Helper Factories ── */

function createCreditHelper(userId: string): CreditHelper {
  return {
    async checkBalance(): Promise<number> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiCreditsBalance: true },
      });
      return user?.aiCreditsBalance ?? 0;
    },
    async deductCredits(amount: number, reason: string): Promise<boolean> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiCreditsBalance: true },
      });
      if (!user || user.aiCreditsBalance < amount) return false;
      await prisma.user.update({
        where: { id: userId },
        data: { aiCreditsBalance: { decrement: amount } },
      });
      console.log(`[CustomNode] Credits deducted: ${amount} from user ${userId} — ${reason}`);
      return true;
    },
    async estimateCost(operation: string): Promise<number> {
      const costs: Record<string, number> = {
        llm_complete: 1,
        llm_vision: 2,
        http_request: 0,
        storage_read: 0,
        storage_write: 0,
      };
      return costs[operation] ?? 1;
    },
  };
}

function createLLMHelper(): LLMHelper {
  const claude = getClaudeClient();
  return {
    async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
      const response = await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content[0];
      return block.type === "text" ? block.text : "";
    },
    async completeWithVision(prompt: string, imageUrl: string, options?: { maxTokens?: number }): Promise<string> {
      const response = await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: options?.maxTokens ?? 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: imageUrl } },
              { type: "text", text: prompt },
            ],
          },
        ],
      });
      const block = response.content[0];
      return block.type === "text" ? block.text : "";
    },
  };
}

function createHTTPHelper(): HTTPHelper {
  async function doFetch(
    url: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HTTPResponse> {
    // Sicherheit: nur HTTPS, kein localhost
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Nur HTTPS-URLs erlaubt");
    }
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)) {
      throw new Error("Localhost-Zugriff nicht erlaubt");
    }

    const fetchHeaders: Record<string, string> = { ...headers };
    if (body && !fetchHeaders["Content-Type"]) {
      fetchHeaders["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    const responseText = await res.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // Text-Response
    }

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: res.status,
      statusText: res.statusText,
      body: responseBody,
      headers: responseHeaders,
    };
  }

  return {
    get: (url, headers) => doFetch(url, "GET", undefined, headers),
    post: (url, body, headers) => doFetch(url, "POST", body, headers),
    put: (url, body, headers) => doFetch(url, "PUT", body, headers),
    delete: (url, headers) => doFetch(url, "DELETE", undefined, headers),
  };
}

// In-Memory Storage pro Session (wird bei Neustart zurueckgesetzt)
// TODO: Persistenter Storage via dediziertem DB-Model
const storageCache = new Map<string, string>();

function createStorageHelper(userId: string, nodeId: string): StorageHelper {
  const prefix = `custom_node:${userId}:${nodeId}`;

  return {
    async get(key: string): Promise<unknown | null> {
      const stored = storageCache.get(`${prefix}:${key}`);
      if (stored === undefined) return null;
      try {
        return JSON.parse(stored);
      } catch {
        return stored;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      storageCache.set(`${prefix}:${key}`, JSON.stringify(value));
    },
    async delete(key: string): Promise<void> {
      storageCache.delete(`${prefix}:${key}`);
    },
  };
}

/* ── Runtime ── */

export class CustomNodeRuntime {
  /**
   * Laedt und validiert eine Node-Definition aus JSON.
   */
  loadNode(json: unknown): CustomNodeDefinition {
    const validation = validateDefinition(json);
    if (!validation.valid) {
      throw new Error(`Ungueltige Node-Definition: ${validation.errors.join(", ")}`);
    }
    return json as CustomNodeDefinition;
  }

  /**
   * Fuehrt eine Custom Node aus und gibt ein Workflow-kompatibles ActionNodeResult zurueck.
   * Timeout: 60 Sekunden. Kein Dateisystem-Zugriff.
   */
  async executeNode(
    userId: string,
    customNodeId: string,
    input: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<ActionNodeResult> {
    // Node-Definition laden
    const customNode = await prisma.customNode.findUnique({
      where: { id: customNodeId },
    });

    if (!customNode) {
      return { contextDelta: {}, success: false, error: "Custom Node nicht gefunden" };
    }

    const definition = customNode.definition as unknown as CustomNodeDefinition;
    if (!definition || !definition.executeCode) {
      return { contextDelta: {}, success: false, error: "Ungueltige Node-Definition" };
    }

    // Helper-Instanzen erstellen
    const context: NodeExecutionContext = {
      input,
      config,
      agentId: (config.agentId as string) || "",
      userId,
      credits: createCreditHelper(userId),
      llm: createLLMHelper(),
      http: createHTTPHelper(),
      storage: createStorageHelper(userId, customNode.nodeId),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

    try {
      const sandboxGlobals = {
        input: structuredClone(context.input),
        config: structuredClone(context.config),
        agentId: context.agentId,
        userId: context.userId,
        credits: context.credits,
        llm: context.llm,
        http: context.http,
        storage: context.storage,
      };

      const wrappedCode = `
        "use strict";
        return (async function executeCustomNode({ input, config, agentId, userId, credits, llm, http, storage }) {
          ${definition.executeCode}
        })(sandboxGlobals);
      `;

      const executeFn = new Function("sandboxGlobals", wrappedCode);
      const resultPromise = executeFn(sandboxGlobals) as Promise<unknown>;

      // Race gegen Timeout
      const result = await Promise.race([
        resultPromise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("Ausfuehrung abgebrochen: Timeout nach 60 Sekunden"));
          });
        }),
      ]);

      const nodeResult = this.normalizeResult(result);

      return {
        contextDelta: nodeResult.output,
        success: nodeResult.status === "success",
        error: nodeResult.error,
        meta: {
          customNodeId: customNode.id,
          nodeId: customNode.nodeId,
          creditsUsed: nodeResult.creditsUsed,
        },
      };
    } catch (err) {
      return {
        contextDelta: {},
        success: false,
        error: err instanceof Error ? err.message : "Unbekannter Fehler bei der Ausfuehrung",
        meta: { customNodeId: customNode.id },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Laedt alle installierten Custom Nodes eines Users.
   */
  async loadInstalledNodes(userId: string): Promise<CustomNodeDefinition[]> {
    const installations = await prisma.customNodeInstallation.findMany({
      where: { userId },
      include: {
        customNode: true,
      },
    });

    return installations
      .filter((inst) => inst.customNode.status === "published")
      .map((inst) => inst.customNode.definition as unknown as CustomNodeDefinition);
  }

  /**
   * Normalisiert ein beliebiges Ergebnis zu einem NodeResult.
   */
  private normalizeResult(result: unknown): NodeResult {
    if (!result || typeof result !== "object") {
      return { output: { result }, status: "success" };
    }

    const r = result as Record<string, unknown>;
    return {
      output: (r.output && typeof r.output === "object" ? r.output : { result }) as Record<string, unknown>,
      status: r.status === "error" ? "error" : "success",
      error: typeof r.error === "string" ? r.error : undefined,
      creditsUsed: typeof r.creditsUsed === "number" ? r.creditsUsed : undefined,
    };
  }
}

export const nodeRuntime = new CustomNodeRuntime();
