import { z } from "zod";

/**
 * Zod-Schemas für die wichtigsten mutierenden API-Routen.
 *
 * Design-Prinzip: bekannte Felder werden typisiert (insbesondere Enums, damit
 * ungültige Werte als 400 statt als DB-500 enden), aber alle Schemas sind
 * `.passthrough()` — unbekannte/zusätzliche Felder bleiben unverändert
 * erhalten, damit bestehende Clients nicht brechen. Stringlängen sind großzügig
 * gewählt (Schutz vor Riesen-Payloads, ohne reale Eingaben abzuschneiden).
 */

// --- Enums (Quelle: prisma/schema.prisma) ---
const AGENT_MODE = ["CHAT", "TASK"] as const;
const AGENT_VISIBILITY = ["PUBLIC", "INTERNAL"] as const;
const AGENT_STATUS = ["DRAFT", "LIVE", "PAUSED"] as const;
const MODEL_PROVIDER = ["ANTHROPIC", "OPENAI", "PERPLEXITY", "GOOGLE", "MISTRAL", "GROQ"] as const;
const TRIGGER_TYPE = ["MANUAL", "SCHEDULE", "WEBHOOK", "EVENT", "FOLLOWUP"] as const;
const OUTPUT_TYPE = ["NONE", "HTTP_REQUEST", "EMAIL", "NEXT_AGENT", "WEBHOOK", "CUSTOM_CODE"] as const;
const KB_TYPE = ["PDF", "URL", "FAQ", "TEXT"] as const;

// POST /api/agents — Agent erstellen
export const agentCreateSchema = z
  .object({
    name: z.string().min(1).max(300),
    slug: z.string().min(1).max(300),
    systemPrompt: z.string().min(1).max(200_000),
    description: z.string().max(10_000).optional(),
    modelProvider: z.enum(MODEL_PROVIDER).optional(),
    triggerType: z.enum(TRIGGER_TYPE).optional(),
    outputType: z.enum(OUTPUT_TYPE).optional(),
    mode: z.enum(AGENT_MODE).optional(),
    agentMode: z.enum(AGENT_MODE).optional(), // legacy alias
    visibility: z.enum(AGENT_VISIBILITY).optional(),
    agentType: z.enum(AGENT_VISIBILITY).optional(), // legacy alias
    subOrgId: z.string().optional(),
  })
  .passthrough();

// PATCH /api/agents/[id] — Agent aktualisieren (alle Felder optional)
export const agentUpdateSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    slug: z.string().min(1).max(300).optional(),
    systemPrompt: z.string().min(1).max(200_000).optional(),
    description: z.string().max(10_000).optional(),
    mode: z.enum(AGENT_MODE).optional(),
    agentMode: z.enum(AGENT_MODE).optional(), // legacy alias
    visibility: z.enum(AGENT_VISIBILITY).optional(),
    agentType: z.enum(AGENT_VISIBILITY).optional(), // legacy alias
    status: z.enum(AGENT_STATUS).optional(),
    modelProvider: z.enum(MODEL_PROVIDER).optional(),
    triggerType: z.enum(TRIGGER_TYPE).optional(),
    outputType: z.enum(OUTPUT_TYPE).optional(),
  })
  .passthrough();

// POST /api/teams — Team/Workflow erstellen (name ODER template erforderlich)
export const teamCreateSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    description: z.string().max(10_000).optional(),
    goal: z.string().max(20_000).optional(),
    template: z.string().max(300).optional(),
    isSubWorkflow: z.boolean().optional(),
    subOrgId: z.string().optional(),
  })
  .passthrough()
  .refine((b) => Boolean(b.name) || Boolean(b.template), {
    message: "name or template is required",
  });

// POST /api/integrations — Integration anlegen/aktualisieren
export const integrationCreateSchema = z
  .object({
    provider: z.string().min(1).max(100),
    name: z.string().min(1).max(300),
    config: z.record(z.unknown()).optional(),
    isCustom: z.boolean().optional(),
  })
  .passthrough();

// POST /api/customers/identify — Kunde identifizieren (email ODER phone nötig,
// fachlich geprüft in identifyCustomer; hier nur Typ/Format)
export const customerIdentifySchema = z
  .object({
    email: z.string().max(320).optional(),
    phone: z.string().max(50).optional(),
    name: z.string().max(300).optional(),
  })
  .passthrough();

// POST /api/agents/[id]/knowledge — Knowledge-Eintrag (JSON-Variante).
// Multipart/PDF läuft über einen anderen Pfad und ist hier nicht abgedeckt.
export const knowledgeCreateSchema = z
  .object({
    type: z.enum(KB_TYPE).optional(), // fehlend => Route behandelt als TEXT
    url: z.string().max(2_000).optional(),
    title: z.string().max(500).optional(),
    content: z.string().max(1_000_000).optional(),
    pairs: z
      .array(
        z.object({ question: z.string(), answer: z.string() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;
export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type IntegrationCreateInput = z.infer<typeof integrationCreateSchema>;
export type CustomerIdentifyInput = z.infer<typeof customerIdentifySchema>;
export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>;
