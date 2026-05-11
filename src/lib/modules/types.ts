/**
 * Sprint 19 BYOK Hybrid-Pricing — per Sub-Account module configuration types.
 *
 * Four modules can be configured per Sub-Org:
 *  - `ai`        — Anthropic / OpenAI keys for the LLM layer
 *  - `sms`       — Twilio SMS account
 *  - `voice`     — Twilio Voice account
 *  - `whatsapp`  — Twilio WhatsApp Business account
 *
 * Each module can run in one of three modes:
 *  - `pool`           — KILN-managed credentials; agency billed via add-on
 *  - `byok_agency`    — agency-owned API key; no metered charge
 *  - `byok_customer`  — end-customer-owned API key; no metered charge
 */

export const MODULE_NAMES = ["ai", "sms", "voice", "whatsapp"] as const;
export type ModuleName = (typeof MODULE_NAMES)[number];

export const MODULE_MODES = ["pool", "byok_agency", "byok_customer"] as const;
export type ModuleMode = (typeof MODULE_MODES)[number];

export interface AiModuleCredentials {
  anthropicKey?: string;
  openaiKey?: string;
}

export interface TwilioModuleCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber?: string;
}

export type ModuleCredentials = AiModuleCredentials | TwilioModuleCredentials;

export interface ResolvedAiCredentials {
  /** Whichever provider key applies. AI module returns null if pool mode and the platform default applies. */
  anthropicKey: string | null;
  openaiKey: string | null;
  /** True when the credentials originate from BYOK rather than platform pool. */
  byokActive: boolean;
  /** `pool`, `byok_agency`, or `byok_customer`. */
  mode: ModuleMode;
  /** For audit display: `"agency"` or `"customer@example.com"`. */
  credentialsOwner: string | null;
}

export interface ResolvedTwilioCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber: string | null;
  byokActive: boolean;
  mode: ModuleMode;
  credentialsOwner: string | null;
}

export class ModuleNotActiveError extends Error {
  readonly code = "MODULE_NOT_ACTIVE";
  constructor(public subAccountId: string, public moduleName: ModuleName) {
    super(`Module ${moduleName} is not active for sub-account ${subAccountId}`);
    this.name = "ModuleNotActiveError";
  }
}

export class ModuleMissingCredentialsError extends Error {
  readonly code = "MODULE_MISSING_CREDENTIALS";
  constructor(public subAccountId: string, public moduleName: ModuleName, public mode: ModuleMode) {
    super(`Module ${moduleName} is configured as ${mode} but credentials are missing`);
    this.name = "ModuleMissingCredentialsError";
  }
}

export function isModuleName(value: unknown): value is ModuleName {
  return typeof value === "string" && (MODULE_NAMES as readonly string[]).includes(value);
}

export function isModuleMode(value: unknown): value is ModuleMode {
  return typeof value === "string" && (MODULE_MODES as readonly string[]).includes(value);
}
