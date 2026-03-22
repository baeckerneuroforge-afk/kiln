/**
 * Data Pipeline Workflow Node
 * Führt Datenbank-Queries (SQL oder natürliche Sprache) als Workflow-Schritt aus.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { dbConnector } from "@/lib/data-pipeline/db-connector";
import { queryBuilder } from "@/lib/data-pipeline/query-builder";

/**
 * Datenbank-Query als Workflow-Node ausführen.
 * Unterstützt SQL-Modus und natürliche Sprache (wird automatisch in SQL konvertiert).
 */
export async function executeDataQuery(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = context._userId;
  if (typeof userId !== "string" || !userId) {
    return {
      contextDelta: {},
      success: false,
      error: "Data Pipeline Nodes benötigen einen authentifizierten User (_userId im Context)",
    };
  }

  const connectionId = resolveExpression(String(config.connectionId || ""), context);
  const queryMode = String(config.queryMode || "sql"); // "sql" | "natural_language"
  const rawQuery = resolveExpression(String(config.query || ""), context);
  const resultKey = String(config.resultKey || "queryResult");

  if (!connectionId) {
    return { contextDelta: {}, success: false, error: "Datenbank-Verbindungs-ID fehlt" };
  }

  if (!rawQuery) {
    return { contextDelta: {}, success: false, error: "Query oder Frage fehlt" };
  }

  try {
    let sql: string;
    let explanation: string | undefined;

    if (queryMode === "natural_language") {
      // Schema laden und natürliche Sprache in SQL konvertieren
      const schema = await dbConnector.getSchema(connectionId, userId);
      const connection = await dbConnector.getConnection(connectionId, userId);
      const dbType = connection.type as "postgresql" | "mysql" | "sqlite";

      const built = await queryBuilder.buildQuery(schema, rawQuery, dbType);
      sql = built.sql;
      explanation = built.explanation;
    } else {
      sql = rawQuery;
    }

    // Query ausführen
    const result = await dbConnector.executeQuery(connectionId, userId, sql);

    return {
      contextDelta: {
        [resultKey]: {
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
          sql,
          explanation,
          queryMode,
        },
      },
      success: true,
      meta: {
        connectionId,
        queryMode,
        rowCount: result.rowCount,
        executionTimeMs: result.executionTimeMs,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Datenbank-Query fehlgeschlagen",
      meta: { connectionId, queryMode },
    };
  }
}
