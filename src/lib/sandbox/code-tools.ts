/**
 * Code Execution Tools für Agents
 * Werkzeuge die Agents nutzen können um Code auszuführen, Dateien zu erstellen
 * und Daten zu verarbeiten — neben den bestehenden Browser-Tools.
 */

import {
  createSandbox,
  executeCode,
  readFile,
  writeFile,
  listFiles,
  installPackage,
  downloadFile,
  destroySandbox,
  isCodeSandboxAvailable,
  type ExecutionResult,
} from "./code-sandbox";
import { saveArtifact, type Artifact } from "./artifact-manager";

/* ── Types ── */

export interface CodeToolResult {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: Artifact[];
  data?: unknown;
}

interface ActiveCodeSession {
  sandboxId: string;
  language: "python" | "javascript";
  createdAt: string;
}

// Aktive Sessions pro Workflow-Execution
const codeSessionsByExecution = new Map<string, ActiveCodeSession>();

/**
 * Stellt sicher dass eine Code-Session für die Execution existiert.
 */
async function ensureSession(
  executionId: string,
  language: "python" | "javascript"
): Promise<string | null> {
  if (!isCodeSandboxAvailable()) {
    return null;
  }

  const existing = codeSessionsByExecution.get(executionId);
  if (existing) return existing.sandboxId;

  const sandbox = await createSandbox(language);
  if (sandbox.status === "failed") return null;

  codeSessionsByExecution.set(executionId, {
    sandboxId: sandbox.id,
    language,
    createdAt: new Date().toISOString(),
  });

  return sandbox.id;
}

/* ── Tool: Execute Python ── */

export async function executePython(
  executionId: string,
  code: string
): Promise<CodeToolResult> {
  const sessionId = await ensureSession(executionId, "python");
  if (!sessionId) {
    return { success: false, error: "Code-Sandbox nicht verfügbar (E2B_API_KEY fehlt)" };
  }

  const result = await executeCode(sessionId, "python", code);
  return formatResult(result);
}

/* ── Tool: Execute JavaScript ── */

export async function executeJavascript(
  executionId: string,
  code: string
): Promise<CodeToolResult> {
  const sessionId = await ensureSession(executionId, "javascript");
  if (!sessionId) {
    return { success: false, error: "Code-Sandbox nicht verfügbar (E2B_API_KEY fehlt)" };
  }

  const result = await executeCode(sessionId, "javascript", code);
  return formatResult(result);
}

/* ── Tool: Create File ── */

export async function createFile(
  executionId: string,
  path: string,
  content: string
): Promise<CodeToolResult> {
  const sessionId = getSessionId(executionId);
  if (!sessionId) {
    return { success: false, error: "Keine aktive Code-Session" };
  }

  const success = await writeFile(sessionId, path, content);
  return {
    success,
    output: success ? `Datei erstellt: ${path}` : undefined,
    error: success ? undefined : `Datei konnte nicht erstellt werden: ${path}`,
  };
}

/* ── Tool: Read File ── */

export async function readSandboxFile(
  executionId: string,
  path: string
): Promise<CodeToolResult> {
  const sessionId = getSessionId(executionId);
  if (!sessionId) {
    return { success: false, error: "Keine aktive Code-Session" };
  }

  const content = await readFile(sessionId, path);
  if (content === null) {
    return { success: false, error: `Datei nicht gefunden: ${path}` };
  }

  return { success: true, output: content };
}

/* ── Tool: List Directory ── */

export async function listDirectory(
  executionId: string,
  path: string = "/"
): Promise<CodeToolResult> {
  const sessionId = getSessionId(executionId);
  if (!sessionId) {
    return { success: false, error: "Keine aktive Code-Session" };
  }

  const files = await listFiles(sessionId, path);
  return {
    success: true,
    output: files.join("\n"),
    data: files,
  };
}

/* ── Tool: Install Package ── */

export async function installSandboxPackage(
  executionId: string,
  language: "python" | "javascript",
  packageName: string
): Promise<CodeToolResult> {
  const sessionId = await ensureSession(executionId, language);
  if (!sessionId) {
    return { success: false, error: "Code-Sandbox nicht verfügbar" };
  }

  const manager = language === "python" ? "pip" as const : "npm" as const;
  const result = await installPackage(sessionId, manager, packageName);
  return {
    success: result.success,
    output: result.output.slice(0, 2000),
    error: result.success ? undefined : result.output.slice(0, 500),
  };
}

/* ── Tool: Download Artifact ── */

export async function downloadArtifactTool(
  executionId: string,
  sandboxPath: string
): Promise<CodeToolResult> {
  const sessionId = getSessionId(executionId);
  if (!sessionId) {
    return { success: false, error: "Keine aktive Code-Session" };
  }

  const buffer = await downloadFile(sessionId, sandboxPath);
  if (!buffer) {
    return { success: false, error: `Datei nicht herunterladbar: ${sandboxPath}` };
  }

  // MIME-Type bestimmen
  const ext = sandboxPath.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    html: "text/html",
    py: "text/x-python",
    js: "text/javascript",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  const mimeType = mimeTypes[ext] || "application/octet-stream";

  try {
    const artifact = await saveArtifact(
      executionId,
      sandboxPath,
      buffer,
      mimeType
    );

    return {
      success: true,
      output: `Artifact gespeichert: ${artifact.fileName} (${artifact.id})`,
      artifacts: [artifact],
    };
  } catch (err) {
    return {
      success: false,
      error: `Artifact-Speicherung fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannt"}`,
    };
  }
}

/* ── Session Cleanup ── */

export async function cleanupCodeSession(executionId: string): Promise<void> {
  const session = codeSessionsByExecution.get(executionId);
  if (!session) return;

  await destroySandbox(session.sandboxId);
  codeSessionsByExecution.delete(executionId);
}

/* ── Helpers ── */

function getSessionId(executionId: string): string | null {
  return codeSessionsByExecution.get(executionId)?.sandboxId || null;
}

function formatResult(result: ExecutionResult): CodeToolResult {
  return {
    success: result.success,
    output: result.stdout || undefined,
    error: result.error || (result.stderr ? result.stderr : undefined),
  };
}
