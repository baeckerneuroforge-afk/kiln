/**
 * Safe wrapper for sandboxed user code execution.
 * Applies: strict mode, timeout, code length limit, global blocking, error handling, audit logging.
 */
import vm from "node:vm";
import * as Sentry from "@sentry/nextjs";

const MAX_CODE_LENGTH = 10_000;
const EXECUTION_TIMEOUT_MS = 5_000;

const BLOCKED_GLOBALS = [
  "process", "require", "module", "exports", "__dirname", "__filename",
  "globalThis", "global", "fetch", "XMLHttpRequest", "WebSocket",
  "eval", "Function", "setTimeout", "setInterval", "setImmediate",
  "clearTimeout", "clearInterval", "clearImmediate",
  "Buffer", "child_process", "fs", "path", "os", "net", "http", "https",
  "crypto",
];

interface SafeEvalOptions {
  /** Argument names exposed in the sandbox (e.g. ["input", "output"]) */
  args: string[];
  /** Argument values in the same order as args */
  values: unknown[];
  /** The user-provided code string */
  code: string;
  /** For audit logging */
  userId?: string;
  agentId?: string;
  /** Label for the log (e.g. "pre-process", "post-process", "custom-code") */
  label?: string;
}

interface SafeEvalResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

export function safeEval<T = unknown>(opts: SafeEvalOptions): Promise<SafeEvalResult<T>> {
  const { args, values, code, userId, agentId, label = "custom-code" } = opts;

  // Audit log
  console.log(
    `[safe-eval] ${label} | user=${userId || "?"} agent=${agentId || "?"} code_length=${code.length}`
  );

  // Length check
  if (code.length > MAX_CODE_LENGTH) {
    return Promise.resolve({
      success: false,
      error: `Custom code exceeds maximum length of ${MAX_CODE_LENGTH} characters (got ${code.length})`,
    });
  }

  const sandbox = Object.create(null) as Record<string, unknown>;
  for (const blockedGlobal of BLOCKED_GLOBALS) {
    sandbox[blockedGlobal] = undefined;
  }
  for (let index = 0; index < args.length; index++) {
    sandbox[args[index]] = values[index];
  }
  const context = vm.createContext(sandbox);
  const wrappedCode = `(async () => { "use strict";\n${code}\n})()`;

  try {
    const script = new vm.Script(wrappedCode);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("Custom code execution timed out (5s)")), EXECUTION_TIMEOUT_MS);
    });
    const executionPromise = Promise.resolve().then(
      () => script.runInContext(context, { timeout: EXECUTION_TIMEOUT_MS }) as T
    );

    return Promise.race([
      executionPromise,
      timeoutPromise,
    ]).then(
      (result) => ({ success: true, result }),
      (err) => {
        Sentry.captureException(err, {
          level: "warning",
          tags: { component: "safe-eval", label, agentId: agentId || "unknown" },
          extra: { userId, codeLength: code.length },
        });
        return {
          success: false,
          error: `Custom code execution failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    ).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    });
  } catch (err) {
    // Compilation error (syntax error in user code)
    Sentry.captureException(err, {
      level: "warning",
      tags: { component: "safe-eval", label, agentId: agentId || "unknown" },
      extra: { userId, codeLength: code.length },
    });
    return Promise.resolve({
      success: false,
      error: `Custom code compilation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export { MAX_CODE_LENGTH };
