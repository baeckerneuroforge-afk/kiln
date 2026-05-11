import type { ModuleName } from "@/lib/modules/types";

/**
 * Sprint 19.5.2 — Frontend credential-shape validation for the Module
 * Settings UI.
 *
 * Mirrors the server-side regex in the configure-route so the UI can
 * surface inline errors before round-tripping. The server still re-
 * validates on POST; this is a UX optimization, not a security
 * boundary. Patterns are kept identical to the server to avoid drift.
 */

export type ModuleMode = "pool" | "byok_agency" | "byok_customer";

export interface AICredentialsDraft {
  anthropicKey?: string;
  openaiKey?: string;
}

export interface TwilioCredentialsDraft {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
}

export type CredentialsDraft = AICredentialsDraft | TwilioCredentialsDraft;

const ANTHROPIC_KEY_PATTERN = /^sk-ant-/;
const OPENAI_KEY_PATTERN = /^sk-/;
const TWILIO_SID_PATTERN = /^AC[a-f0-9]+$/i;
const E164_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateAICredentials(creds: AICredentialsDraft): ValidationResult {
  const errors: Record<string, string> = {};
  const anthropic = (creds.anthropicKey ?? "").trim();
  const openai = (creds.openaiKey ?? "").trim();

  if (!anthropic && !openai) {
    errors.anthropicKey = "Mindestens ein Schlüssel (Anthropic oder OpenAI) ist erforderlich";
  }
  if (anthropic && !ANTHROPIC_KEY_PATTERN.test(anthropic)) {
    errors.anthropicKey = "Anthropic-Key muss mit sk-ant- beginnen";
  }
  if (openai && !OPENAI_KEY_PATTERN.test(openai)) {
    errors.openaiKey = "OpenAI-Key muss mit sk- beginnen";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateTwilioCredentials(
  creds: TwilioCredentialsDraft,
  options: { requirePhoneNumber?: boolean } = {},
): ValidationResult {
  const errors: Record<string, string> = {};
  const sid = (creds.accountSid ?? "").trim();
  const token = (creds.authToken ?? "").trim();
  const phone = (creds.phoneNumber ?? "").trim();

  if (!sid) errors.accountSid = "Account SID ist erforderlich";
  else if (!TWILIO_SID_PATTERN.test(sid))
    errors.accountSid = "Account SID muss mit AC + Hex beginnen";

  if (!token) errors.authToken = "Auth Token ist erforderlich";

  if (phone && !E164_PHONE_PATTERN.test(phone))
    errors.phoneNumber = "Telefonnummer muss im E.164-Format sein (z.B. +49301234567)";
  if (options.requirePhoneNumber && !phone)
    errors.phoneNumber = "Telefonnummer ist erforderlich";

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateCredentialsOwner(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "credentialsOwner muss eine gültige Email-Adresse sein";
  if (!EMAIL_PATTERN.test(trimmed)) return "credentialsOwner muss eine gültige Email-Adresse sein";
  return null;
}

export function validateModuleDraft(args: {
  moduleName: ModuleName;
  mode: ModuleMode;
  credentials: CredentialsDraft | null;
  credentialsOwner: string | null;
}): ValidationResult {
  if (args.mode === "pool") {
    return { ok: true, errors: {} };
  }

  const inner =
    args.moduleName === "ai"
      ? validateAICredentials((args.credentials ?? {}) as AICredentialsDraft)
      : validateTwilioCredentials((args.credentials ?? {}) as TwilioCredentialsDraft);

  const errors = { ...inner.errors };
  if (args.mode === "byok_customer") {
    const ownerError = validateCredentialsOwner(args.credentialsOwner);
    if (ownerError) errors.credentialsOwner = ownerError;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export const MODULE_LABELS: Record<ModuleName, string> = {
  ai: "AI",
  sms: "SMS",
  voice: "Voice",
  whatsapp: "WhatsApp",
};

export const MODULE_DESCRIPTIONS: Record<ModuleName, string> = {
  ai: "LLM-gestützte Anfrage-Bearbeitung und Antwort-Drafts.",
  sms: "Eingehende und ausgehende SMS-Kommunikation via Twilio.",
  voice: "Voice-Anrufe für Notdienst-Routing und Termin-Bestätigung.",
  whatsapp: "WhatsApp Business API für Templates und 2-Way-Messaging.",
};

export function isTwilioModule(moduleName: ModuleName): boolean {
  return moduleName === "sms" || moduleName === "voice" || moduleName === "whatsapp";
}
