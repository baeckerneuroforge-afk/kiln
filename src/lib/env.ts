import { z } from "zod";

/**
 * Zentraler, typisierter Zugriff auf Environment-Variablen.
 *
 * Bewusst über GETTER implementiert, die process.env zur ZUGRIFFSZEIT lesen.
 * Das passt zum Codebase-Muster (Env wird zur Laufzeit gelesen) und ist
 * kompatibel mit Tests, die Env-Vars pro Testfall setzen/stubben
 * (vi.stubEnv / direkte process.env-Mutation). Eine import-zeit-erfassende
 * Lösung (z.B. t3-env) würde hier die Test-Suite bzw. den Build brechen, da
 * die meisten Vars dort nicht gesetzt sind.
 *
 * Validierung läuft NICHT beim Import (das würde Suite/Build brechen), sondern
 * OPT-IN über validateEnv() — z.B. in einem Startup-/Health-Check.
 *
 * Leere Strings werden zu `undefined` normalisiert (emptyStringAsUndefined).
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  get NODE_ENV() {
    return process.env.NODE_ENV;
  },

  // Core / Infra
  get DATABASE_URL() {
    return read("DATABASE_URL");
  },
  get DIRECT_URL() {
    return read("DIRECT_URL");
  },
  get ENCRYPTION_KEY() {
    return read("ENCRYPTION_KEY");
  },
  get CRON_SECRET() {
    return read("CRON_SECRET");
  },
  get NEXT_PUBLIC_APP_URL() {
    return read("NEXT_PUBLIC_APP_URL");
  },
  get NEXT_PUBLIC_APP_DOMAIN() {
    return read("NEXT_PUBLIC_APP_DOMAIN");
  },

  // Auth (Clerk)
  get CLERK_SECRET_KEY() {
    return read("CLERK_SECRET_KEY");
  },
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY() {
    return read("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  },
  get CLERK_WEBHOOK_SECRET() {
    return read("CLERK_WEBHOOK_SECRET");
  },

  // AI providers
  get ANTHROPIC_API_KEY() {
    return read("ANTHROPIC_API_KEY");
  },
  get OPENAI_API_KEY() {
    return read("OPENAI_API_KEY");
  },

  // Billing (Stripe)
  get STRIPE_SECRET_KEY() {
    return read("STRIPE_SECRET_KEY");
  },
  get STRIPE_WEBHOOK_SECRET() {
    return read("STRIPE_WEBHOOK_SECRET");
  },

  // Supabase
  get NEXT_PUBLIC_SUPABASE_URL() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },

  // Email
  get RESEND_API_KEY() {
    return read("RESEND_API_KEY");
  },

  // Rate-limit / cache (Upstash)
  get UPSTASH_REDIS_REST_URL() {
    return read("UPSTASH_REDIS_REST_URL");
  },
  get UPSTASH_REDIS_REST_TOKEN() {
    return read("UPSTASH_REDIS_REST_TOKEN");
  },

  // Integrations — Google Calendar
  get GOOGLE_CALENDAR_CLIENT_ID() {
    return read("GOOGLE_CALENDAR_CLIENT_ID");
  },
  get GOOGLE_CLIENT_ID() {
    return read("GOOGLE_CLIENT_ID");
  },
  get GOOGLE_CALENDAR_CLIENT_SECRET() {
    return read("GOOGLE_CALENDAR_CLIENT_SECRET");
  },
  get GOOGLE_CLIENT_SECRET() {
    return read("GOOGLE_CLIENT_SECRET");
  },
  get GOOGLE_CALENDAR_REDIRECT_URI() {
    return read("GOOGLE_CALENDAR_REDIRECT_URI");
  },

  // Browser automation
  get E2B_API_KEY() {
    return read("E2B_API_KEY");
  },
  get BROWSERLESS_API_KEY() {
    return read("BROWSERLESS_API_KEY");
  },
} as const;

/**
 * Vars, die in dev/prod immer vorhanden sein müssen, damit die App grundlegend
 * funktioniert. Im Test NICHT geprüft (validateEnv wird dort nicht aufgerufen).
 */
const REQUIRED_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const satisfies readonly (keyof typeof env)[];

const requiredSchema = z.object(
  Object.fromEntries(REQUIRED_KEYS.map((k) => [k, z.string().min(1)])),
);

/**
 * Opt-in-Validierung der kritischen Env-Vars. NICHT beim Import aufrufen
 * (sonst brechen Tests/Build). Aufruf z.B. aus einem Startup-/Health-Check.
 *
 * @returns Liste der fehlenden/ungültigen Pflicht-Vars (leer = alles ok).
 */
export function validateEnv(): string[] {
  const candidate = Object.fromEntries(REQUIRED_KEYS.map((k) => [k, env[k]]));
  const result = requiredSchema.safeParse(candidate);
  if (result.success) return [];
  return Object.keys(result.error.flatten().fieldErrors);
}
