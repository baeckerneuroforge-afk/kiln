import { z } from "zod";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Validiert einen bereits geparsten Request-Body gegen ein Zod-Schema.
 *
 * Bei Erfolg kommt das typisierte Ergebnis zurück; bei Fehler eine fertige
 * 400-Response in der bestehenden `{ error, details }`-Form der Routen.
 *
 * Die Schemas nutzen `.passthrough()`, d.h. unbekannte Felder bleiben erhalten
 * (kein Strippen) — so fügt die Validierung Typ-/Enum-Sicherheit hinzu, ohne
 * valide Requests zu brechen, die Felder mitschicken, die wir nicht explizit
 * deklarieren.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
