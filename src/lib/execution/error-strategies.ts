/**
 * Error Strategy Library
 * Sammlung von Recovery-Strategien für häufige Fehler bei Sub-Agent-Ausführung.
 */

/* ── Types ── */

export type ErrorType =
  | "WEBSITE_TIMEOUT"
  | "ELEMENT_NOT_FOUND"
  | "AUTH_REQUIRED"
  | "CAPTCHA_DETECTED"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "CODE_EXECUTION_FAILED"
  | "CONTEXT_TOO_LONG"
  | "UNKNOWN";

export interface RecoveryStep {
  action: string;
  description: string;
  waitMs?: number;
}

export interface RecoveryResult {
  recovered: boolean;
  strategyUsed: string;
  stepsAttempted: number;
  finalAction: string;
}

/* ── Strategy Definitions ── */

const STRATEGIES: Record<ErrorType, RecoveryStep[]> = {
  WEBSITE_TIMEOUT: [
    { action: "retry_longer_timeout", description: "Retry with 30s timeout", waitMs: 1000 },
    { action: "try_cached", description: "Try cached/archived version" },
    { action: "skip_note_failure", description: "Skip site and note failure in results" },
  ],

  ELEMENT_NOT_FOUND: [
    { action: "try_alternative_selectors", description: "Try alternative CSS selectors" },
    { action: "try_keyboard_nav", description: "Try keyboard navigation" },
    { action: "try_scroll", description: "Scroll page and retry" },
    { action: "skip_step", description: "Skip this step" },
  ],

  AUTH_REQUIRED: [
    { action: "check_credentials", description: "Check if credentials exist for this domain" },
    { action: "try_login_flow", description: "Attempt automated login flow" },
    { action: "report_login_required", description: "Report 'login required' in results" },
  ],

  CAPTCHA_DETECTED: [
    { action: "skip_site_captcha", description: "Skip site, note 'blocked by captcha'" },
  ],

  RATE_LIMITED: [
    { action: "wait_short", description: "Wait 30 seconds and retry", waitMs: 30000 },
    { action: "wait_long", description: "Wait 2 minutes and retry", waitMs: 120000 },
    { action: "skip_rate_limited", description: "Skip, note 'rate limited'" },
  ],

  API_ERROR: [
    { action: "retry_1s", description: "Retry after 1 second", waitMs: 1000 },
    { action: "retry_5s", description: "Retry after 5 seconds", waitMs: 5000 },
    { action: "retry_15s", description: "Retry after 15 seconds", waitMs: 15000 },
    { action: "skip_api_error", description: "Skip, note API error" },
  ],

  CODE_EXECUTION_FAILED: [
    { action: "analyze_fix_retry", description: "Analyze error, fix code, retry (attempt 1)" },
    { action: "analyze_fix_retry_2", description: "Analyze error, fix code, retry (attempt 2)" },
    { action: "analyze_fix_retry_3", description: "Analyze error, fix code, retry (attempt 3)" },
    { action: "skip_code_error", description: "Skip, note code execution failed" },
  ],

  CONTEXT_TOO_LONG: [
    { action: "summarize_retry", description: "Summarize context and retry with compressed version" },
    { action: "truncate_retry", description: "Truncate to last 50% and retry" },
    { action: "skip_context_error", description: "Skip, note context too long" },
  ],

  UNKNOWN: [
    { action: "retry_once", description: "Retry once", waitMs: 2000 },
    { action: "skip_unknown", description: "Skip, note unknown error" },
  ],
};

/* ── Error Detection ── */

/**
 * Erkennt den Fehlertyp aus einer Error-Message.
 */
export function detectErrorType(error: string): ErrorType {
  const lower = error.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset")) {
    return "WEBSITE_TIMEOUT";
  }
  if (lower.includes("element not found") || lower.includes("selector") || lower.includes("no such element")) {
    return "ELEMENT_NOT_FOUND";
  }
  if (lower.includes("login") || lower.includes("auth") || lower.includes("401") || lower.includes("unauthorized")) {
    return "AUTH_REQUIRED";
  }
  if (lower.includes("captcha") || lower.includes("recaptcha") || lower.includes("challenge")) {
    return "CAPTCHA_DETECTED";
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return "RATE_LIMITED";
  }
  if (lower.includes("code execution") || lower.includes("syntax error") || lower.includes("runtime error") || lower.includes("traceback")) {
    return "CODE_EXECUTION_FAILED";
  }
  if (lower.includes("context") || lower.includes("too long") || lower.includes("token limit") || lower.includes("max_tokens")) {
    return "CONTEXT_TOO_LONG";
  }
  if (lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("api error") || lower.includes("server error")) {
    return "API_ERROR";
  }

  return "UNKNOWN";
}

/* ── ErrorStrategyLibrary Class ── */

export class ErrorStrategyLibrary {
  /**
   * Gibt die Recovery-Schritte für einen Fehlertyp zurück.
   */
  getStrategy(errorType: ErrorType): RecoveryStep[] {
    return STRATEGIES[errorType] || STRATEGIES.UNKNOWN;
  }

  /**
   * Führt Recovery-Schritte durch bis einer funktioniert.
   * Gibt den Recovery-Schritt zurück der als nächstes versucht werden soll.
   * Der Caller ist verantwortlich für die tatsächliche Ausführung.
   */
  getNextRecoveryStep(errorType: ErrorType, attemptIndex: number): RecoveryStep | null {
    const steps = this.getStrategy(errorType);
    if (attemptIndex >= steps.length) return null;
    return steps[attemptIndex];
  }

  /**
   * Prüft ob für einen Fehlertyp noch Recovery-Optionen verfügbar sind.
   */
  hasMoreSteps(errorType: ErrorType, attemptIndex: number): boolean {
    const steps = this.getStrategy(errorType);
    return attemptIndex < steps.length;
  }

  /**
   * Gibt eine menschenlesbare Beschreibung der Strategie zurück
   * (für Logging und Reasoning-Einträge).
   */
  describeStrategy(errorType: ErrorType): string {
    const steps = this.getStrategy(errorType);
    return `[${errorType}] ${steps.length} recovery steps: ${steps.map((s) => s.action).join(" → ")}`;
  }
}
