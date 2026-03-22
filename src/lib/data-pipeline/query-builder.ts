/**
 * QueryBuilder — konvertiert natürliche Sprache sicher in SQL.
 * Nutzt Claude Haiku für die Generierung und validiert das Ergebnis.
 */

import Anthropic from "@anthropic-ai/sdk";

/* ── Typen ── */

export interface SchemaInfo {
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
}

export interface BuildQueryResult {
  sql: string;
  explanation: string;
}

export interface SqlValidation {
  valid: boolean;
  reason?: string;
}

/* ── Gefährliche SQL-Muster ── */

const DANGEROUS_STATEMENTS = /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE)\b/i;

/* ── QueryBuilder Klasse ── */

class QueryBuilder {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /**
   * Natürliche Sprache in SQL konvertieren
   */
  async buildQuery(
    schema: SchemaInfo,
    question: string,
    dbType: "postgresql" | "mysql" | "sqlite" = "postgresql"
  ): Promise<BuildQueryResult> {
    const schemaDescription = this.formatSchemaForPrompt(schema);

    const dialectHint =
      dbType === "mysql"
        ? "Verwende MySQL-Syntax (Backticks für Bezeichner)."
        : dbType === "sqlite"
          ? "Verwende SQLite-Syntax."
          : "Verwende PostgreSQL-Syntax (doppelte Anführungszeichen für Bezeichner bei Bedarf).";

    const response = await this.client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Du bist ein SQL-Experte. Generiere eine SELECT-Query basierend auf der Frage des Nutzers.

DATENBANK-SCHEMA:
${schemaDescription}

REGELN:
- Nur SELECT-Statements generieren, KEINE Schreiboperationen
- ${dialectHint}
- Kein Semikolon am Ende
- Immer LIMIT verwenden (max 10000)
- Parametrisierte Queries sind nicht nötig — die Frage kommt vom System, nicht vom Endnutzer
- Antworte NUR im folgenden JSON-Format, kein zusätzlicher Text

FRAGE: ${question}

Antwort als JSON:
{"sql": "SELECT ...", "explanation": "Kurze Erklärung auf Deutsch was die Query macht"}`,
        },
      ],
    });

    // Antwort parsen
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unerwartetes Antwortformat vom LLM");
    }

    let parsed: { sql: string; explanation: string };
    try {
      // JSON aus der Antwort extrahieren (auch wenn drumherum Text steht)
      const jsonMatch = content.text.match(/\{[\s\S]*"sql"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Kein JSON in der Antwort gefunden");
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("LLM-Antwort konnte nicht als JSON geparst werden");
    }

    // Strip multiple statements — only execute the first one
    let sql = parsed.sql;
    if (sql.includes(';')) {
      sql = sql.split(';')[0].trim();
    }

    // Sicherheitsvalidierung
    const validation = this.validateSql(sql, false);
    if (!validation.valid) {
      throw new Error(`Generierte Query ist unsicher: ${validation.reason}`);
    }

    return {
      sql,
      explanation: parsed.explanation,
    };
  }

  /**
   * Interessante Fragen basierend auf dem Schema vorschlagen
   */
  async suggestQuestions(schema: SchemaInfo): Promise<string[]> {
    const schemaDescription = this.formatSchemaForPrompt(schema);

    const response = await this.client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Du bist ein Datenanalyst. Basierend auf diesem Datenbank-Schema, schlage 5 interessante analytische Fragen vor, die ein Nutzer stellen könnte.

SCHEMA:
${schemaDescription}

Antworte NUR als JSON-Array mit 5 Strings auf Deutsch:
["Frage 1", "Frage 2", ...]`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return ["Wie viele Einträge gibt es insgesamt?"];
    }

    try {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return ["Wie viele Einträge gibt es insgesamt?"];
      return JSON.parse(jsonMatch[0]) as string[];
    } catch {
      return ["Wie viele Einträge gibt es insgesamt?"];
    }
  }

  /**
   * SQL-Statement auf gefährliche Operationen prüfen
   */
  validateSql(sql: string, writeEnabled: boolean): SqlValidation {
    if (!sql || sql.trim().length === 0) {
      return { valid: false, reason: "SQL-Statement ist leer" };
    }

    if (!writeEnabled && DANGEROUS_STATEMENTS.test(sql)) {
      const match = sql.match(DANGEROUS_STATEMENTS);
      return {
        valid: false,
        reason: `Schreiboperation '${match?.[0]}' ist nicht erlaubt. Nur SELECT-Queries sind zugelassen.`,
      };
    }

    return { valid: true };
  }

  /* ── Private: Schema für Prompt formatieren ── */

  private formatSchemaForPrompt(schema: SchemaInfo): string {
    return schema.tables
      .map((table) => {
        const cols = table.columns
          .map((c) => `  - ${c.name} (${c.type}${c.nullable ? ", nullable" : ""})`)
          .join("\n");
        return `Tabelle: ${table.name}\n${cols}`;
      })
      .join("\n\n");
  }
}

export const queryBuilder = new QueryBuilder();
