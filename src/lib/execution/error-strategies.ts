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

/* ── Retry Cooldown ── */

const RETRY_COOLDOWNS = [2000, 5000, 15000]; // Exponentiell: 2s, 5s, 15s

/* ── Strategy Definitions ── */

const STRATEGIES: Record<ErrorType, RecoveryStep[]> = {
  WEBSITE_TIMEOUT: [
    { action: "retry_longer_timeout", description: "Retry with 30s timeout", waitMs: RETRY_COOLDOWNS[0] },
    { action: "try_cached", description: "Try cached/archived version", waitMs: RETRY_COOLDOWNS[1] },
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

/* ── Site Health Tracking ── */

const UNHEALTHY_THRESHOLD = 3; // Fehler pro Domain bevor sie als unhealthy markiert wird

/* ── Headless Detection Countermeasures ── */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

const VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

/* ── ErrorStrategyLibrary Class ── */

export class ErrorStrategyLibrary {
  private domainFailures = new Map<string, number>();
  private unhealthyDomains = new Set<string>();
  private userAgentIndex: number;
  private viewportIndex: number;

  constructor() {
    // Zufällige Startindizes für Rotation
    this.userAgentIndex = Math.floor(Math.random() * USER_AGENTS.length);
    this.viewportIndex = Math.floor(Math.random() * VIEWPORT_SIZES.length);
  }

  /**
   * Gibt die Recovery-Schritte für einen Fehlertyp zurück.
   */
  getStrategy(errorType: ErrorType): RecoveryStep[] {
    return STRATEGIES[errorType] || STRATEGIES.UNKNOWN;
  }

  /**
   * Gibt den Recovery-Schritt zurück der als nächstes versucht werden soll.
   * Wendet Retry-Cooldown an (exponentielle Wartezeit).
   */
  getNextRecoveryStep(errorType: ErrorType, attemptIndex: number): RecoveryStep | null {
    const steps = this.getStrategy(errorType);
    if (attemptIndex >= steps.length) return null;

    const step = { ...steps[attemptIndex] };

    // Cooldown anwenden wenn nicht schon spezifiziert
    if (!step.waitMs && attemptIndex < RETRY_COOLDOWNS.length) {
      step.waitMs = RETRY_COOLDOWNS[attemptIndex];
    }

    return step;
  }

  /**
   * Prüft ob für einen Fehlertyp noch Recovery-Optionen verfügbar sind.
   */
  hasMoreSteps(errorType: ErrorType, attemptIndex: number): boolean {
    const steps = this.getStrategy(errorType);
    return attemptIndex < steps.length;
  }

  /**
   * Gibt eine menschenlesbare Beschreibung der Strategie zurück.
   */
  describeStrategy(errorType: ErrorType): string {
    const steps = this.getStrategy(errorType);
    return `[${errorType}] ${steps.length} recovery steps: ${steps.map((s) => s.action).join(" → ")}`;
  }

  /* ── Site Health ── */

  /**
   * Registriert einen Fehler für eine Domain.
   * Markiert Domains als "unhealthy" nach UNHEALTHY_THRESHOLD Fehlern.
   */
  recordDomainFailure(domain: string): void {
    const count = (this.domainFailures.get(domain) || 0) + 1;
    this.domainFailures.set(domain, count);
    if (count >= UNHEALTHY_THRESHOLD) {
      this.unhealthyDomains.add(domain);
    }
  }

  /** Registriert einen Erfolg für eine Domain */
  recordDomainSuccess(domain: string): void {
    // Erfolg reduziert den Fehlerzähler
    const count = this.domainFailures.get(domain) || 0;
    if (count > 0) {
      this.domainFailures.set(domain, count - 1);
    }
  }

  /**
   * Prüft ob eine Domain als "unhealthy" markiert ist.
   * Unhealthy Domains sollten übersprungen werden.
   */
  isDomainUnhealthy(domain: string): boolean {
    return this.unhealthyDomains.has(domain);
  }

  /** Extrahiert die Domain aus einer URL */
  extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /** Gibt alle unhealthy Domains zurück */
  getUnhealthyDomains(): string[] {
    return Array.from(this.unhealthyDomains);
  }

  /* ── Headless Detection Countermeasures ── */

  /**
   * Gibt einen rotierenden User-Agent zurück.
   */
  getNextUserAgent(): string {
    const ua = USER_AGENTS[this.userAgentIndex % USER_AGENTS.length];
    this.userAgentIndex++;
    return ua;
  }

  /**
   * Gibt eine realistische Viewport-Größe zurück.
   */
  getNextViewport(): { width: number; height: number } {
    const vp = VIEWPORT_SIZES[this.viewportIndex % VIEWPORT_SIZES.length];
    this.viewportIndex++;
    return vp;
  }

  /**
   * Gibt realistische Browser-Headers zurück.
   */
  getRealisticHeaders(): Record<string, string> {
    return {
      "User-Agent": this.getNextUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "DNT": "1",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
  }
}
