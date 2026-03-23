/**
 * Code Sandbox Node Executor
 * Erstellt eine E2B-Sandbox, generiert Code via LLM, führt ihn aus,
 * analysiert das Ergebnis und iteriert bei Fehlern.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import {
  isCodeSandboxAvailable,
  createSandbox,
  executeCode,
  installPackage,
  listFiles,
  downloadFile,
  destroySandbox,
} from "@/lib/sandbox/code-sandbox";
import { saveArtifact, type Artifact } from "@/lib/sandbox/artifact-manager";

const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_ITERATIONS = 10;

/* ── Types ── */

interface CodeGeneration {
  code: string;
  language: "python" | "javascript";
  explanation: string;
  packages?: string[];
}

interface SandboxNodeResult {
  goal: string;
  language: string;
  iterations: number;
  finalOutput: string;
  executionLog: Array<{
    iteration: number;
    code: string;
    stdout: string;
    stderr: string;
    success: boolean;
  }>;
  artifacts: Artifact[];
  totalDurationMs: number;
  status: "completed" | "max_iterations" | "error";
}

/* ── LLM Code Generation ── */

async function generateCode(
  goal: string,
  language: "python" | "javascript",
  context: Record<string, unknown>,
  previousAttempts: Array<{ code: string; error: string }>,
  model: string
): Promise<CodeGeneration> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");

  const previousContext = previousAttempts.length > 0
    ? `\n\nVorherige fehlgeschlagene Versuche:\n${previousAttempts.map((a, i) =>
        `Versuch ${i + 1}:\nCode:\n\`\`\`\n${a.code}\n\`\`\`\nFehler: ${a.error}`
      ).join("\n\n")}\n\nBitte behebe die Fehler.`
    : "";

  const contextData = Object.keys(context).length > 0
    ? `\n\nVerfügbare Kontextdaten:\n${JSON.stringify(context, null, 2).slice(0, 5000)}`
    : "";

  const systemPrompt = `Du bist ein Code-Generierungs-Experte. Schreibe ${language === "python" ? "Python" : "JavaScript/Node.js"} Code der die gegebene Aufgabe löst.

Regeln:
- Code muss vollständig und ausführbar sein
- Ergebnisse mit print() (Python) oder console.log() (JS) ausgeben
- Dateien in /tmp/ speichern (CSVs, Bilder, etc.)
- Für Datenverarbeitung: pandas, matplotlib, numpy verfügbar (Python)
- Für Webdaten: requests, beautifulsoup4 verfügbar (Python)
- Code soll sauber und fehlerfrei sein
${previousContext}
${contextData}

Antworte AUSSCHLIESSLICH als JSON:
{
  "code": "der auszuführende Code",
  "language": "${language}",
  "explanation": "kurze Erklärung was der Code tut",
  "packages": ["optionale", "zusätzliche", "packages"]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Aufgabe: ${goal}` },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Claude API: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<CodeGeneration>;
      return {
        code: parsed.code || "",
        language: parsed.language || language,
        explanation: parsed.explanation || "",
        packages: parsed.packages,
      };
    }
  } catch {
    // Fallback: Versuche Code-Block zu extrahieren
  }

  // Fallback: Raw-Text als Code
  const codeMatch = text.match(/```(?:python|javascript|js)?\n([\s\S]*?)```/);
  return {
    code: codeMatch ? codeMatch[1] : text,
    language,
    explanation: "Code aus Response extrahiert",
  };
}

/* ── Output Analysis ── */

async function analyzeOutput(
  goal: string,
  code: string,
  stdout: string,
  stderr: string,
  success: boolean,
  iteration: number
): Promise<{ isDone: boolean; summary: string; needsRevision: boolean; revisionHint?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { isDone: success, summary: stdout.slice(0, 500), needsRevision: !success };
  }

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
      messages: [
        {
          role: "user",
          content: `Ziel: ${goal}\n\nCode (Iteration ${iteration}):\n\`\`\`\n${code.slice(0, 3000)}\n\`\`\`\n\nStdout:\n${stdout.slice(0, 2000)}\n\nStderr:\n${stderr.slice(0, 1000)}\n\nErfolg: ${success}\n\nAnalysiere: Hat der Code das Ziel erreicht? Antworte als JSON:\n{"isDone": true/false, "summary": "kurze Zusammenfassung des Ergebnisses", "needsRevision": true/false, "revisionHint": "was verbessert werden muss"}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return { isDone: success, summary: stdout.slice(0, 500), needsRevision: !success };
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as {
        isDone: boolean;
        summary: string;
        needsRevision: boolean;
        revisionHint?: string;
      };
    }
  } catch {
    // Fallback
  }

  return { isDone: success, summary: stdout.slice(0, 500), needsRevision: !success };
}

/* ── Main Executor ── */

export async function executeCodeSandbox(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const goal = resolveExpression(String(config.goal || ""), context);
  const language = String(config.language || "python") as "python" | "javascript" | "auto";
  const maxIterations = Math.min(Number(config.maxIterations) || 5, MAX_ITERATIONS);
  const preInstallPackages = (config.packages as string[] | undefined) || [];
  const resultKey = String(config.resultKey || "codeSandboxResult");
  const timeoutMs = Math.min(Number(config.timeoutMs) || 600000, 600000); // Max 10 min

  if (!goal) {
    return { contextDelta: {}, success: false, error: "Ziel-Beschreibung fehlt" };
  }

  if (!isCodeSandboxAvailable()) {
    return { contextDelta: {}, success: false, error: "E2B_API_KEY nicht konfiguriert — Code-Sandbox nicht verfügbar" };
  }

  // Sprache bestimmen
  const resolvedLanguage: "python" | "javascript" =
    language === "auto"
      ? (goal.toLowerCase().includes("javascript") || goal.toLowerCase().includes("node") || goal.toLowerCase().includes("typescript")
          ? "javascript"
          : "python")
      : language;

  const startTime = Date.now();
  const executionLog: SandboxNodeResult["executionLog"] = [];
  const collectedArtifacts: Artifact[] = [];

  // 1. Sandbox erstellen
  const sandbox = await createSandbox(resolvedLanguage, timeoutMs);
  if (sandbox.status === "failed") {
    return {
      contextDelta: {},
      success: false,
      error: "Sandbox-Erstellung fehlgeschlagen",
    };
  }

  try {
    // 2. Pakete vorinstallieren
    if (preInstallPackages.length > 0) {
      const manager = resolvedLanguage === "python" ? "pip" as const : "npm" as const;
      for (const pkg of preInstallPackages) {
        await installPackage(sandbox.id, manager, pkg);
      }
    }

    // 3. Iterative Code-Generierung und Ausführung
    const previousAttempts: Array<{ code: string; error: string }> = [];
    let finalOutput = "";
    let status: SandboxNodeResult["status"] = "max_iterations";

    // Kontextdaten für den LLM bereitstellen
    const contextForLLM: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (!key.startsWith("_") && typeof value !== "function") {
        contextForLLM[key] = value;
      }
    }

    const model = maxIterations <= 3 ? HAIKU_MODEL : SONNET_MODEL;

    for (let i = 0; i < maxIterations; i++) {
      // Code generieren
      const generated = await generateCode(
        goal,
        resolvedLanguage,
        contextForLLM,
        previousAttempts,
        model
      );

      // Code ausführen
      const result = await executeCode(sandbox.id, resolvedLanguage, generated.code);

      executionLog.push({
        iteration: i + 1,
        code: generated.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.success,
      });

      // Ergebnis analysieren
      const analysis = await analyzeOutput(
        goal,
        generated.code,
        result.stdout,
        result.stderr,
        result.success,
        i + 1
      );

      if (analysis.isDone && !analysis.needsRevision) {
        finalOutput = analysis.summary || result.stdout;
        status = "completed";

        // Generierte Dateien einsammeln
        try {
          const tmpFiles = await listFiles(sandbox.id, "/tmp");
          for (const fileName of tmpFiles) {
            if (fileName === "." || fileName === "..") continue;
            const filePath = `/tmp/${fileName}`;
            const buffer = await downloadFile(sandbox.id, filePath);
            if (buffer && buffer.length > 0 && buffer.length < 50 * 1024 * 1024) {
              const ext = fileName.split(".").pop()?.toLowerCase() || "";
              const mimeTypes: Record<string, string> = {
                csv: "text/csv", json: "application/json", png: "image/png",
                jpg: "image/jpeg", pdf: "application/pdf", txt: "text/plain",
                html: "text/html", svg: "image/svg+xml", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              };
              const mimeType = mimeTypes[ext] || "application/octet-stream";

              try {
                const executionId = String(context._executionId || sandbox.id);
                const artifact = await saveArtifact(executionId, filePath, buffer, mimeType);
                collectedArtifacts.push(artifact);
              } catch {
                // Artifact-Speicherung optional
              }
            }
          }
        } catch {
          // Dateien auflisten optional
        }

        break;
      }

      // Fehler für nächste Iteration sammeln
      if (!result.success || analysis.needsRevision) {
        previousAttempts.push({
          code: generated.code,
          error: analysis.revisionHint || result.error || result.stderr || "Unbekannter Fehler",
        });
      }
    }

    const nodeResult: SandboxNodeResult = {
      goal,
      language: resolvedLanguage,
      iterations: executionLog.length,
      finalOutput,
      executionLog,
      artifacts: collectedArtifacts,
      totalDurationMs: Date.now() - startTime,
      status,
    };

    return {
      contextDelta: {
        [resultKey]: nodeResult,
        [`${resultKey}_output`]: finalOutput,
        [`${resultKey}_artifacts`]: collectedArtifacts.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          url: a.storageUrl,
        })),
      },
      success: status === "completed",
      error: status !== "completed" ? `Code-Ausführung nach ${executionLog.length} Iterationen nicht abgeschlossen` : undefined,
      meta: {
        language: resolvedLanguage,
        iterations: executionLog.length,
        status,
        artifactCount: collectedArtifacts.length,
        totalDurationMs: nodeResult.totalDurationMs,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Code-Sandbox fehlgeschlagen",
      meta: {
        language: resolvedLanguage,
        iterations: executionLog.length,
        totalDurationMs: Date.now() - startTime,
      },
    };
  } finally {
    await destroySandbox(sandbox.id);
  }
}
