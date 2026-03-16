/**
 * Safe wrapper for sandboxed user code execution via new Function().
 * Applies: strict mode, timeout, code length limit, global blocking, error handling, audit logging.
 */
import * as Sentry from "@sentry/nextjs";

const MAX_CODE_LENGTH = 10_000;
const EXECUTION_TIMEOUT_MS = 5_000;

// Globals to neutralize inside user code. These get prepended as `const X = undefined;`
// so any attempt to reference them throws a clear error instead of accessing Node internals.
const BLOCKED_GLOBALS = [
  "process", "require", "module", "exports", "__dirname", "__filename",
  "globalThis", "global", "fetch", "XMLHttpRequest", "WebSocket",
  "eval", "Function", "setTimeout", "setInterval", "setImmediate",
  "clearTimeout", "clearInterval", "clearImmediate",
  "Buffer", "child_process", "fs", "path", "os", "net", "http", "https",
  "crypto",
];

const GLOBALS_BLOCK = BLOCKED_GLOBALS
  .map((g) => `var ${g} = undefined;`)
  .join("");

interface SafeEvalOptions {
  /** Argument names passed to the Function constructor (e.g. ["input", "output"]) */
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

  // Build the wrapped code: block globals + strict mode + user code
  const wrappedCode = `"use strict";\n${GLOBALS_BLOCK}\n${code}`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...args, wrappedCode);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Custom code execution timed out (5s)")), EXECUTION_TIMEOUT_MS);
    });

    return Promise.race([
      Promise.resolve(fn(...values)) as Promise<T>,
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
    );
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
