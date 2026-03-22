/**
 * Data Pipeline Tools — Werkzeuge für AI-Agents zur Datenbankinteraktion.
 * Werden im Agent-Chat und in Workflows verwendet.
 */

import Anthropic from "@anthropic-ai/sdk";
import { dbConnector } from "./db-connector";
import { queryBuilder } from "./query-builder";

/* ── Tool-Definitionen ── */

const queryDatabaseTool: Anthropic.Tool = {
  name: "query_database",
  description:
    "Führt eine SQL-Query auf einer verbundenen Datenbank aus. Nur SELECT-Queries erlaubt (außer Schreibmodus ist aktiviert). Gibt Spalten, Zeilen und Ausführungszeit zurück.",
  input_schema: {
    type: "object" as const,
    properties: {
      connectionId: {
        type: "string",
        description: "ID der Datenbankverbindung",
      },
      sql: {
        type: "string",
        description: "SQL-Query (bevorzugt SELECT)",
      },
    },
    required: ["connectionId", "sql"],
  },
};

const listTablesTool: Anthropic.Tool = {
  name: "list_tables",
  description:
    "Listet alle Tabellen einer verbundenen Datenbank mit Spalteninformationen auf.",
  input_schema: {
    type: "object" as const,
    properties: {
      connectionId: {
        type: "string",
        description: "ID der Datenbankverbindung",
      },
    },
    required: ["connectionId"],
  },
};

const describeTableTool: Anthropic.Tool = {
  name: "describe_table",
  description:
    "Zeigt detaillierte Schema-Informationen für eine bestimmte Tabelle (Spalten, Datentypen, Nullable).",
  input_schema: {
    type: "object" as const,
    properties: {
      connectionId: {
        type: "string",
        description: "ID der Datenbankverbindung",
      },
      tableName: {
        type: "string",
        description: "Name der Tabelle",
      },
    },
    required: ["connectionId", "tableName"],
  },
};

const getSampleDataTool: Anthropic.Tool = {
  name: "get_sample_data",
  description:
    "Gibt die ersten N Zeilen einer Tabelle zurück (Standard: 10). Nützlich um die Datenstruktur zu verstehen.",
  input_schema: {
    type: "object" as const,
    properties: {
      connectionId: {
        type: "string",
        description: "ID der Datenbankverbindung",
      },
      tableName: {
        type: "string",
        description: "Name der Tabelle",
      },
      limit: {
        type: "number",
        description: "Anzahl der Zeilen (Standard: 10, Max: 100)",
      },
    },
    required: ["connectionId", "tableName"],
  },
};

const runAnalysisTool: Anthropic.Tool = {
  name: "run_analysis",
  description:
    "Beantwortet eine Frage in natürlicher Sprache über die Datenbank. Konvertiert die Frage automatisch in SQL, führt sie aus und liefert die Ergebnisse.",
  input_schema: {
    type: "object" as const,
    properties: {
      connectionId: {
        type: "string",
        description: "ID der Datenbankverbindung",
      },
      question: {
        type: "string",
        description: "Frage in natürlicher Sprache über die Daten",
      },
    },
    required: ["connectionId", "question"],
  },
};

/* ── Alle Tools als Array ── */

const ALL_DATA_PIPELINE_TOOLS: Anthropic.Tool[] = [
  queryDatabaseTool,
  listTablesTool,
  describeTableTool,
  getSampleDataTool,
  runAnalysisTool,
];

/**
 * Gibt alle Data Pipeline Tools zurück
 */
// userId reserved for future per-user tool filtering
export function getDataPipelineTools(userId: string): Anthropic.Tool[] {
  void userId;
  return ALL_DATA_PIPELINE_TOOLS;
}

/**
 * Führt ein Data Pipeline Tool aus und gibt das Ergebnis als String zurück
 */
export async function executeDataPipelineTool(
  userId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "query_database":
        return await handleQueryDatabase(userId, input);
      case "list_tables":
        return await handleListTables(userId, input);
      case "describe_table":
        return await handleDescribeTable(userId, input);
      case "get_sample_data":
        return await handleGetSampleData(userId, input);
      case "run_analysis":
        return await handleRunAnalysis(userId, input);
      default:
        return JSON.stringify({ error: `Unbekanntes Tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Tool-Ausführung fehlgeschlagen",
    });
  }
}

/* ── Tool-Handler ── */

async function handleQueryDatabase(
  userId: string,
  input: Record<string, unknown>
): Promise<string> {
  const connectionId = String(input.connectionId);
  const sql = String(input.sql);

  const result = await dbConnector.executeQuery(connectionId, userId, sql);

  return JSON.stringify({
    columns: result.columns,
    rows: result.rows.slice(0, 500), // Agent-Kontext begrenzen
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
    truncated: result.rowCount > 500,
  });
}

async function handleListTables(
  userId: string,
  input: Record<string, unknown>
): Promise<string> {
  const connectionId = String(input.connectionId);
  const schema = await dbConnector.getSchema(connectionId, userId);

  return JSON.stringify({
    tables: schema.tables.map((t) => ({
      name: t.name,
      columnCount: t.columns.length,
      columns: t.columns.map((c) => `${c.name} (${c.type})`),
    })),
    tableCount: schema.tables.length,
  });
}

async function handleDescribeTable(
  userId: string,
  input: Record<string, unknown>
): Promise<string> {
  const connectionId = String(input.connectionId);
  const tableName = String(input.tableName);

  const schema = await dbConnector.getSchema(connectionId, userId);
  const table = schema.tables.find(
    (t) => t.name.toLowerCase() === tableName.toLowerCase()
  );

  if (!table) {
    return JSON.stringify({
      error: `Tabelle '${tableName}' nicht gefunden`,
      availableTables: schema.tables.map((t) => t.name),
    });
  }

  return JSON.stringify({
    name: table.name,
    columns: table.columns,
    columnCount: table.columns.length,
  });
}

async function handleGetSampleData(
  userId: string,
  input: Record<string, unknown>
): Promise<string> {
  const connectionId = String(input.connectionId);
  const tableName = String(input.tableName);
  const limit = Math.min(Number(input.limit) || 10, 100);

  // Tabellen-Name validieren (nur alphanumerisch + Unterstrich)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    return JSON.stringify({ error: "Ungültiger Tabellenname" });
  }

  // Schema abrufen um sicherzustellen, dass die Tabelle existiert
  const schema = await dbConnector.getSchema(connectionId, userId);
  const tableExists = schema.tables.some(
    (t) => t.name.toLowerCase() === tableName.toLowerCase()
  );

  if (!tableExists) {
    return JSON.stringify({
      error: `Tabelle '${tableName}' nicht gefunden`,
      availableTables: schema.tables.map((t) => t.name),
    });
  }

  const result = await dbConnector.executeQuery(
    connectionId,
    userId,
    `SELECT * FROM "${tableName}" LIMIT ${limit}`
  );

  return JSON.stringify({
    table: tableName,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
  });
}

async function handleRunAnalysis(
  userId: string,
  input: Record<string, unknown>
): Promise<string> {
  const connectionId = String(input.connectionId);
  const question = String(input.question);

  // Schema laden
  const schema = await dbConnector.getSchema(connectionId, userId);

  // Datenbanktyp ermitteln
  const connection = await dbConnector.getConnection(connectionId, userId);
  const dbType = connection.type as "postgresql" | "mysql" | "sqlite";

  // Natürliche Sprache → SQL
  const queryResult = await queryBuilder.buildQuery(schema, question, dbType);

  // SQL ausführen
  const execResult = await dbConnector.executeQuery(
    connectionId,
    userId,
    queryResult.sql
  );

  return JSON.stringify({
    question,
    generatedSql: queryResult.sql,
    explanation: queryResult.explanation,
    columns: execResult.columns,
    rows: execResult.rows.slice(0, 500),
    rowCount: execResult.rowCount,
    executionTimeMs: execResult.executionTimeMs,
    truncated: execResult.rowCount > 500,
  });
}
