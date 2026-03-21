/**
 * Multi-Site Orchestrator
 * High-Level Abstraktion über Agent Swarm + Computer Use.
 * Führt die gleiche Aufgabe auf mehreren Websites parallel aus.
 */

import { prisma } from "@/lib/prisma";
import {
  ParallelExecutor,
  type SubTask,
  type SubTaskResult,
} from "@/lib/execution/parallel-executor";
import { saveArtifact } from "@/lib/sandbox/artifact-manager";

/* ── Types ── */

export interface MultiSiteConfig {
  agentId: string;
  urls: string[];
  taskPerSite: string;
  mergeStrategy: "compare_and_rank" | "aggregate" | "summarize";
  outputFormat: "table" | "json" | "csv" | "pdf";
  maxParallel?: number;
  timeoutPerSite?: number;
  workflowRunId?: string;
}

export interface SiteResult {
  url: string;
  status: "completed" | "failed" | "timeout";
  data: Record<string, unknown> | null;
  error?: string;
  screenshotUrl?: string;
  durationMs: number;
}

export interface MultiSiteResult {
  executionId: string;
  results: SiteResult[];
  mergedOutput: unknown;
  artifactUrl?: string;
  totalDurationMs: number;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/* ── Main Class ── */

export class MultiSiteOrchestrator {
  /**
   * Führt die gleiche Aufgabe auf mehreren Websites parallel aus
   */
  async orchestrate(config: MultiSiteConfig): Promise<MultiSiteResult> {
    const startTime = Date.now();
    const maxParallel = Math.min(config.maxParallel || 3, 10);
    const timeoutPerSite = (config.timeoutPerSite || 60) * 1000;

    // DB-Record erstellen
    const execution = await prisma.multiSiteExecution.create({
      data: {
        agentId: config.agentId,
        workflowRunId: config.workflowRunId,
        urls: config.urls,
        taskPerSite: config.taskPerSite,
        mergeStrategy: config.mergeStrategy,
        status: "running",
      },
    });

    try {
      // Sub-Tasks erstellen (eine pro URL)
      const tasks: SubTask[] = config.urls.map((url, i) => ({
        id: `site_${i}`,
        description: `${config.taskPerSite} on ${url}`,
        dependencies: [] as string[],
        config: { url },
      }));

      // Parallel ausführen
      const executor = new ParallelExecutor({ maxConcurrency: maxParallel });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const executionResult = await executor.execute(tasks, async (task, _depResults): Promise<SubTaskResult> => {
        const startMs = Date.now();
        const url = config.urls[parseInt(task.id.replace("site_", ""), 10)];
        try {
          const output = await this.executeSingleSite(url, config.taskPerSite, timeoutPerSite);
          return { id: task.id, status: "completed", output, durationMs: Date.now() - startMs };
        } catch (err) {
          return { id: task.id, status: "failed", output: null, error: err instanceof Error ? err.message : "Fehler", durationMs: Date.now() - startMs };
        }
      });

      // Ergebnisse sammeln
      const siteResults: SiteResult[] = executionResult.results.map((r, i) => {
        const url = config.urls[i];
        if (r.status === "completed" && r.output) {
          const output = r.output as Record<string, unknown>;
          return {
            url,
            status: "completed" as const,
            data: (output.extractedData as Record<string, unknown>) || output,
            screenshotUrl: output.screenshotUrl as string | undefined,
            durationMs: r.durationMs || 0,
          };
        }
        return {
          url,
          status: r.status === "failed" ? "failed" as const : "timeout" as const,
          data: null,
          error: r.error || "Task failed",
          durationMs: r.durationMs || 0,
        };
      });

      // Ergebnisse mergen
      const mergedOutput = await this.mergeResults(
        siteResults.filter((r) => r.status === "completed"),
        config.mergeStrategy,
        config.taskPerSite,
      );

      // Output-Artifact erstellen (CSV/PDF)
      let artifactUrl: string | undefined;
      if (config.outputFormat === "csv") {
        artifactUrl = await this.generateCsv(siteResults, execution.id);
      }

      const totalDurationMs = Date.now() - startTime;

      // DB aktualisieren
      await prisma.multiSiteExecution.update({
        where: { id: execution.id },
        data: {
          status: "completed",
          perSiteResults: JSON.parse(JSON.stringify(siteResults)),
          mergedResult: JSON.parse(JSON.stringify(mergedOutput)),
          artifactUrl,
          completedAt: new Date(),
        },
      });

      return {
        executionId: execution.id,
        results: siteResults,
        mergedOutput,
        artifactUrl,
        totalDurationMs,
      };
    } catch (err) {
      await prisma.multiSiteExecution.update({
        where: { id: execution.id },
        data: {
          status: "failed",
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  /* ── Presets (Factory Methods) ── */

  /**
   * Preset: Preisvergleich über mehrere Websites
   */
  priceComparison(agentId: string, productName: string, urls: string[]): MultiSiteConfig {
    return {
      agentId,
      urls,
      taskPerSite: `Find the price for "${productName}". Extract: product name, price (number), currency, availability, any discounts or promotions. If the product is not found, note that.`,
      mergeStrategy: "compare_and_rank",
      outputFormat: "table",
    };
  }

  /**
   * Preset: Content-Monitoring über mehrere Websites
   */
  contentMonitoring(agentId: string, urls: string[]): MultiSiteConfig {
    return {
      agentId,
      urls,
      taskPerSite: "Extract the main content, headlines, key announcements, and any notable changes on this page. Include dates if visible.",
      mergeStrategy: "aggregate",
      outputFormat: "json",
    };
  }

  /**
   * Preset: Wettbewerbsanalyse
   */
  competitorAnalysis(agentId: string, urls: string[]): MultiSiteConfig {
    return {
      agentId,
      urls,
      taskPerSite: "Analyze this competitor website. Extract: company name, main products/services, pricing (if visible), key value propositions, recent news/updates, contact information.",
      mergeStrategy: "summarize",
      outputFormat: "table",
    };
  }

  /* ── Private Methods ── */

  /**
   * Führt die Aufgabe auf einer einzelnen Website aus
   */
  private async executeSingleSite(
    url: string,
    task: string,
    timeoutMs: number,
  ): Promise<SubTaskResult["output"]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const startTime = Date.now();

    try {
      // Seite fetchen
      const response = await fetch(url, {
        headers: { "User-Agent": "KILN-MultiSite/1.0" },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 15000)),
      });

      if (!response.ok) {
        return { url, status: "failed", error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000);

      // LLM-Extraktion
      const extractResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 2048,
          system: "You extract structured data from website content. Return ONLY valid JSON.",
          messages: [{
            role: "user",
            content: `Website: ${url}\n\nTask: ${task}\n\nPage content:\n${textContent}\n\nExtract the requested information as a JSON object.`,
          }],
        }),
        signal: AbortSignal.timeout(timeoutMs - (Date.now() - startTime)),
      });

      if (!extractResponse.ok) {
        return { url, status: "failed", error: "LLM extraction failed" };
      }

      const data = await extractResponse.json() as {
        content: Array<{ type: string; text: string }>;
      };
      const resultText = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

      // JSON parsen
      let extractedData: Record<string, unknown> = {};
      try {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
        }
      } catch {
        extractedData = { rawText: resultText };
      }

      return {
        url,
        status: "completed",
        extractedData,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        url,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Merged Ergebnisse nach Strategie
   */
  private async mergeResults(
    results: SiteResult[],
    strategy: string,
    task: string,
  ): Promise<unknown> {
    if (results.length === 0) {
      return { error: "No successful results to merge" };
    }

    switch (strategy) {
      case "compare_and_rank":
        return this.compareAndRank(results);
      case "aggregate":
        return this.aggregate(results);
      case "summarize":
        return this.summarize(results, task);
      default:
        return this.aggregate(results);
    }
  }

  /**
   * Vergleicht und rankt Ergebnisse (z.B. nach Preis)
   */
  private compareAndRank(results: SiteResult[]): unknown {
    // Versuche nach "price" zu sortieren
    const withPrice = results
      .filter((r) => r.data)
      .map((r) => {
        const data = r.data as Record<string, unknown>;
        let price = 0;
        // Suche nach price-ähnlichen Feldern
        for (const key of Object.keys(data)) {
          if (key.toLowerCase().includes("price") || key.toLowerCase().includes("preis")) {
            const val = data[key];
            const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.,]/g, "").replace(",", "."));
            if (!isNaN(num)) { price = num; break; }
          }
        }
        return { url: r.url, data: r.data, price, durationMs: r.durationMs };
      })
      .sort((a, b) => {
        if (a.price === 0 && b.price === 0) return 0;
        if (a.price === 0) return 1;
        if (b.price === 0) return -1;
        return a.price - b.price;
      });

    return {
      ranked: withPrice,
      bestMatch: withPrice[0] || null,
      totalSites: results.length,
    };
  }

  /**
   * Aggregiert alle Ergebnisse in einem Dataset
   */
  private aggregate(results: SiteResult[]): unknown {
    return {
      sites: results.map((r) => ({
        url: r.url,
        data: r.data,
        durationMs: r.durationMs,
      })),
      totalSites: results.length,
    };
  }

  /**
   * Erstellt eine LLM-basierte Zusammenfassung
   */
  private async summarize(results: SiteResult[], task: string): Promise<unknown> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return this.aggregate(results);

    const dataOverview = results
      .map((r) => `${r.url}: ${JSON.stringify(r.data).slice(0, 500)}`)
      .join("\n\n");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          system: "You write concise comparison summaries. Be factual, highlight key differences.",
          messages: [{
            role: "user",
            content: `Task: ${task}\n\nResults from ${results.length} websites:\n${dataOverview}\n\nWrite a professional comparison summary highlighting key differences and the best option.`,
          }],
        }),
      });

      if (!response.ok) return this.aggregate(results);

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };
      const summaryText = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

      return {
        summary: summaryText,
        sites: results.map((r) => ({ url: r.url, data: r.data })),
        totalSites: results.length,
      };
    } catch {
      return this.aggregate(results);
    }
  }

  /**
   * Generiert CSV-Output und speichert als Artifact
   */
  private async generateCsv(results: SiteResult[], executionId: string): Promise<string> {
    // Alle Schlüssel aus den Ergebnissen sammeln
    const allKeys = new Set<string>(["url", "status"]);
    for (const r of results) {
      if (r.data) {
        Object.keys(r.data).forEach((k) => allKeys.add(k));
      }
    }

    const headers = Array.from(allKeys);
    const rows = results.map((r) => {
      return headers.map((h) => {
        if (h === "url") return r.url;
        if (h === "status") return r.status;
        if (r.data && h in r.data) {
          const val = r.data[h];
          return typeof val === "object" ? JSON.stringify(val) : String(val);
        }
        return "";
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const artifact = await saveArtifact(
      executionId,
      `multi-site-results-${Date.now()}.csv`,
      Buffer.from(csvContent, "utf-8"),
      "text/csv",
    );

    return artifact.storageUrl;
  }
}
