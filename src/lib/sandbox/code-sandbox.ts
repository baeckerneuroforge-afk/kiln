/**
 * Code Execution Sandbox — E2B Integration
 * Isolierte Code-Ausführungsumgebung für Python und JavaScript.
 * Nutzt E2B SDK (@e2b/code-interpreter) für sichere Sandbox-Execution.
 */

import { Sandbox } from "@e2b/code-interpreter";

/* ── Types ── */

export interface SandboxSession {
  id: string;
  sandbox: Sandbox | null;
  status: "creating" | "running" | "completed" | "failed" | "destroyed";
  language: "python" | "javascript";
  createdAt: string;
  executionLog: ExecutionLogEntry[];
  artifacts: SandboxArtifact[];
  timeoutMs: number;
}

export interface ExecutionLogEntry {
  type: "code" | "output" | "error" | "file" | "install";
  content: string;
  language?: string;
  timestamp: string;
  durationMs?: number;
}

export interface SandboxArtifact {
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  durationMs: number;
  artifacts: SandboxArtifact[];
}

/* ── Session Store ── */

const activeSandboxes = new Map<string, SandboxSession>();

/**
 * Prüft ob der Code-Sandbox-Service verfügbar ist.
 */
export function isCodeSandboxAvailable(): boolean {
  return !!process.env.E2B_API_KEY;
}

/**
 * Erstellt eine neue Sandbox-Session.
 */
export async function createSandbox(
  language: "python" | "javascript" = "python",
  timeoutMs: number = 10 * 60 * 1000 // 10 Minuten
): Promise<SandboxSession> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    console.warn("[CodeSandbox] E2B_API_KEY nicht gesetzt — Code-Ausführung nicht verfügbar");
    return {
      id: `sandbox_unavailable_${Date.now()}`,
      sandbox: null,
      status: "failed",
      language,
      createdAt: new Date().toISOString(),
      executionLog: [{
        type: "error",
        content: "E2B_API_KEY nicht konfiguriert — Code-Ausführung nicht verfügbar",
        timestamp: new Date().toISOString(),
      }],
      artifacts: [],
      timeoutMs,
    };
  }

  const sessionId = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session: SandboxSession = {
    id: sessionId,
    sandbox: null,
    status: "creating",
    language,
    createdAt: new Date().toISOString(),
    executionLog: [],
    artifacts: [],
    timeoutMs,
  };

  activeSandboxes.set(sessionId, session);

  try {
    const sandbox = await Sandbox.create({
      apiKey,
      timeoutMs,
    });

    session.sandbox = sandbox;
    session.status = "running";

    session.executionLog.push({
      type: "output",
      content: `Sandbox erstellt (${language}, Timeout: ${Math.round(timeoutMs / 1000)}s)`,
      timestamp: new Date().toISOString(),
    });

    return session;
  } catch (err) {
    session.status = "failed";
    session.executionLog.push({
      type: "error",
      content: `Sandbox-Erstellung fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
      timestamp: new Date().toISOString(),
    });
    return session;
  }
}

/**
 * Führt Code in der Sandbox aus.
 */
export async function executeCode(
  sessionId: string,
  language: "python" | "javascript",
  code: string
): Promise<ExecutionResult> {
  const session = activeSandboxes.get(sessionId);
  if (!session || !session.sandbox) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      error: "Sandbox nicht verfügbar oder bereits zerstört",
      durationMs: 0,
      artifacts: [],
    };
  }

  const start = Date.now();

  session.executionLog.push({
    type: "code",
    content: code,
    language,
    timestamp: new Date().toISOString(),
  });

  try {
    const execution = await session.sandbox.runCode(code, {
      language: language === "javascript" ? "js" : "python",
    });

    const stdout = execution.logs.stdout.join("\n");
    const stderr = execution.logs.stderr.join("\n");
    const durationMs = Date.now() - start;
    const hasError = !!execution.error;

    if (stdout) {
      session.executionLog.push({
        type: "output",
        content: stdout,
        timestamp: new Date().toISOString(),
        durationMs,
      });
    }

    if (stderr) {
      session.executionLog.push({
        type: "error",
        content: stderr,
        timestamp: new Date().toISOString(),
        durationMs,
      });
    }

    // Artifacts aus den Results extrahieren
    const newArtifacts: SandboxArtifact[] = [];
    if (execution.results && execution.results.length > 0) {
      for (const result of execution.results) {
        if (result.png) {
          const artifactPath = `/tmp/output_${Date.now()}.png`;
          newArtifacts.push({
            path: artifactPath,
            size: result.png.length,
            mimeType: "image/png",
            createdAt: new Date().toISOString(),
          });
        }
      }
      session.artifacts.push(...newArtifacts);
    }

    return {
      success: !hasError,
      stdout,
      stderr,
      error: hasError ? (execution.error?.name ?? "Execution Error") + ": " + (execution.error?.value ?? "") : undefined,
      durationMs,
      artifacts: newArtifacts,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : "Code-Ausführung fehlgeschlagen";

    session.executionLog.push({
      type: "error",
      content: errorMsg,
      timestamp: new Date().toISOString(),
      durationMs,
    });

    return {
      success: false,
      stdout: "",
      stderr: errorMsg,
      error: errorMsg,
      durationMs,
      artifacts: [],
    };
  }
}

/**
 * Liest eine Datei aus der Sandbox.
 */
export async function readFile(sessionId: string, path: string): Promise<string | null> {
  const session = activeSandboxes.get(sessionId);
  if (!session?.sandbox) return null;

  try {
    const content = await session.sandbox.files.read(path);
    return content;
  } catch {
    return null;
  }
}

/**
 * Schreibt eine Datei in die Sandbox.
 */
export async function writeFile(sessionId: string, path: string, content: string): Promise<boolean> {
  const session = activeSandboxes.get(sessionId);
  if (!session?.sandbox) return false;

  try {
    await session.sandbox.files.write(path, content);

    session.executionLog.push({
      type: "file",
      content: `Datei geschrieben: ${path}`,
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Listet Dateien in einem Verzeichnis.
 */
export async function listFiles(sessionId: string, path: string = "/"): Promise<string[]> {
  const session = activeSandboxes.get(sessionId);
  if (!session?.sandbox) return [];

  try {
    const entries = await session.sandbox.files.list(path);
    return entries.map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Installiert ein Paket in der Sandbox.
 */
export async function installPackage(
  sessionId: string,
  manager: "pip" | "npm",
  pkg: string
): Promise<{ success: boolean; output: string }> {
  const session = activeSandboxes.get(sessionId);
  if (!session?.sandbox) {
    return { success: false, output: "Sandbox nicht verfügbar" };
  }

  const command = manager === "pip" ? `pip install ${pkg}` : `npm install ${pkg}`;

  session.executionLog.push({
    type: "install",
    content: `Installiere: ${command}`,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await session.sandbox.commands.run(command, { timeoutMs: 60000 });
    const output = (result.stdout || "") + (result.stderr || "");

    session.executionLog.push({
      type: "output",
      content: output.slice(0, 2000),
      timestamp: new Date().toISOString(),
    });

    return { success: result.exitCode === 0, output };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Installation fehlgeschlagen";
    return { success: false, output: errorMsg };
  }
}

/**
 * Lädt eine Datei als Buffer herunter.
 */
export async function downloadFile(sessionId: string, path: string): Promise<Buffer | null> {
  const session = activeSandboxes.get(sessionId);
  if (!session?.sandbox) return null;

  try {
    const content = await session.sandbox.files.read(path, { format: "bytes" });
    return Buffer.from(content);
  } catch {
    return null;
  }
}

/**
 * Holt eine aktive Session.
 */
export function getSandboxSession(sessionId: string): SandboxSession | null {
  return activeSandboxes.get(sessionId) || null;
}

/**
 * Zerstört eine Sandbox-Session und räumt auf.
 */
export async function destroySandbox(sessionId: string): Promise<void> {
  const session = activeSandboxes.get(sessionId);
  if (!session) return;

  try {
    if (session.sandbox) {
      await session.sandbox.kill();
    }
  } catch {
    // Ignorieren — Session könnte bereits beendet sein
  }

  session.status = "destroyed";
  session.sandbox = null;

  // Cleanup nach 5 Minuten
  setTimeout(() => activeSandboxes.delete(sessionId), 5 * 60 * 1000);
}
