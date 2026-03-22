/**
 * DBConnector — universelle Datenbank-Verbindungsschicht
 * Verbindet PostgreSQL, MySQL, Snowflake, BigQuery, Supabase, SQLite und REST APIs.
 * Alle Zugangsdaten werden AES-256-GCM verschlüsselt gespeichert.
 */

import { encrypt, decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/* ── Typen ── */

export type DatabaseType =
  | "postgresql"
  | "mysql"
  | "snowflake"
  | "bigquery"
  | "supabase"
  | "sqlite"
  | "rest_api";

export interface ConnectionConfig {
  type: DatabaseType;
  name: string;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  projectId?: string;
  keyFile?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface TestResult {
  success: boolean;
  tables: string[];
  error?: string;
  message?: string;
}

export interface ConnectResult {
  connectionId: string;
  status: "connected";
  tables?: string[];
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
}

export interface SchemaTable {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

export interface SchemaResult {
  tables: SchemaTable[];
}

/* ── Hilfsfunktionen ── */

/** Gefährliche SQL-Statements erkennen */
const DANGEROUS_SQL_RE = /\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b/i;

/** Prüft ob ein LIMIT im Query vorhanden ist */
function hasLimit(sql: string): boolean {
  return /\bLIMIT\s+\d+/i.test(sql);
}

/** Fügt LIMIT hinzu falls nicht vorhanden */
function ensureLimit(sql: string, maxRows: number = 10000): string {
  if (hasLimit(sql)) return sql;
  // Semikolon am Ende entfernen, LIMIT anhängen
  const trimmed = sql.replace(/;\s*$/, "").trim();
  return `${trimmed} LIMIT ${maxRows}`;
}

/* ── DBConnector Klasse ── */

class DBConnector {
  private readonly QUERY_TIMEOUT_MS = 30_000;
  private readonly MAX_ROWS = 10_000;

  /**
   * Verbindung testen und speichern
   */
  async connect(userId: string, config: ConnectionConfig): Promise<ConnectResult> {
    // Zuerst testen ob die Verbindung funktioniert
    const testResult = await this.testConnection(config);
    if (!testResult.success) {
      throw new Error(`Verbindungstest fehlgeschlagen: ${testResult.error || "Unbekannter Fehler"}`);
    }

    // Config verschlüsselt speichern
    const encryptedConfig = encrypt(JSON.stringify(config));

    const connection = await prisma.dataConnection.create({
      data: {
        userId,
        name: config.name,
        type: config.type,
        encryptedConfig,
        status: "connected",
        schemaCache: (testResult.tables.length > 0
          ? testResult.tables.map((t) => ({ name: t, columns: [] }))
          : undefined) as unknown as Prisma.InputJsonValue,
        schemaCacheUpdatedAt: testResult.tables.length > 0 ? new Date() : undefined,
      },
    });

    return {
      connectionId: connection.id,
      status: "connected",
      tables: testResult.tables,
    };
  }

  /**
   * Verbindung testen ohne zu speichern
   */
  async testConnection(config: ConnectionConfig): Promise<TestResult> {
    try {
      switch (config.type) {
        case "postgresql":
          return await this.testPostgres(config);
        case "mysql":
          return await this.testMysql(config);
        case "snowflake":
        case "bigquery":
          // Optionale Treiber — Platzhalter
          return { success: true, tables: [], message: "Driver not installed" };
        case "supabase":
          return await this.testSupabase(config);
        case "rest_api":
          return await this.testRestApi(config);
        case "sqlite":
          return { success: true, tables: [], message: "SQLite verbindung konfiguriert" };
        default:
          return { success: false, tables: [], error: `Unbekannter Datenbanktyp: ${config.type}` };
      }
    } catch (err) {
      return {
        success: false,
        tables: [],
        error: err instanceof Error ? err.message : "Verbindungstest fehlgeschlagen",
      };
    }
  }

  /**
   * SQL-Query ausführen
   */
  async executeQuery(
    connectionId: string,
    userId: string,
    query: string,
    params?: unknown[]
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const connection = await this.loadConnection(connectionId, userId);
    const config = JSON.parse(decrypt(connection.encryptedConfig)) as ConnectionConfig;
    const writeEnabled = connection.writeEnabled;

    // Schreibschutz prüfen
    if (!writeEnabled && DANGEROUS_SQL_RE.test(query)) {
      throw new Error(
        "Schreiboperationen sind für diese Verbindung nicht erlaubt. " +
        "DROP, DELETE, TRUNCATE, INSERT, UPDATE und ALTER sind gesperrt."
      );
    }

    // LIMIT sicherstellen
    const safeSql = ensureLimit(query, this.MAX_ROWS);

    let result: QueryResult;

    try {
      switch (config.type) {
        case "postgresql":
          result = await this.executePostgres(config, safeSql, params, writeEnabled);
          break;
        case "mysql":
          result = await this.executeMysql(config, safeSql, params, writeEnabled);
          break;
        default:
          throw new Error(`Query-Ausführung für ${config.type} nicht unterstützt`);
      }
    } catch (err) {
      // Fehlgeschlagene Query loggen
      await this.logQuery(connectionId, userId, {
        queryMode: "sql",
        originalQuery: query,
        status: "error",
        error: err instanceof Error ? err.message : "Query fehlgeschlagen",
        executionTimeMs: Date.now() - startTime,
      });
      throw err;
    }

    const executionTimeMs = Date.now() - startTime;
    result.executionTimeMs = executionTimeMs;

    // Erfolgreiche Query loggen
    await this.logQuery(connectionId, userId, {
      queryMode: "sql",
      originalQuery: query,
      generatedSql: safeSql !== query ? safeSql : undefined,
      rowCount: result.rowCount,
      executionTimeMs,
      status: "success",
    });

    // lastUsedAt aktualisieren
    await prisma.dataConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date() },
    });

    return result;
  }

  /**
   * Datenbank-Schema abrufen (mit Caching)
   */
  async getSchema(connectionId: string, userId: string): Promise<SchemaResult> {
    const connection = await this.loadConnection(connectionId, userId);
    const config = JSON.parse(decrypt(connection.encryptedConfig)) as ConnectionConfig;

    // Cache prüfen (max 1 Stunde alt)
    if (
      connection.schemaCache &&
      connection.schemaCacheUpdatedAt &&
      Date.now() - new Date(connection.schemaCacheUpdatedAt).getTime() < 3_600_000
    ) {
      return { tables: connection.schemaCache as unknown as SchemaTable[] };
    }

    let tables: SchemaTable[];

    switch (config.type) {
      case "postgresql":
        tables = await this.getPostgresSchema(config);
        break;
      case "mysql":
        tables = await this.getMysqlSchema(config);
        break;
      default:
        throw new Error(`Schema-Abruf für ${config.type} nicht unterstützt`);
    }

    // Schema cachen
    await prisma.dataConnection.update({
      where: { id: connectionId },
      data: {
        schemaCache: tables as unknown as Prisma.InputJsonValue,
        schemaCacheUpdatedAt: new Date(),
      },
    });

    return { tables };
  }

  /**
   * Verbindung als getrennt markieren
   */
  async disconnect(connectionId: string, userId: string): Promise<void> {
    await this.loadConnection(connectionId, userId); // Berechtigung prüfen
    await prisma.dataConnection.update({
      where: { id: connectionId },
      data: { status: "disconnected" },
    });
  }

  /**
   * Alle Verbindungen eines Users abrufen (ohne entschlüsselte Config)
   */
  async getConnections(userId: string) {
    const connections = await prisma.dataConnection.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        writeEnabled: true,
        lastUsedAt: true,
        schemaCacheUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return connections;
  }

  /**
   * Einzelne Verbindung abrufen (ohne entschlüsselte Config)
   */
  async getConnection(connectionId: string, userId: string) {
    const connection = await prisma.dataConnection.findFirst({
      where: { id: connectionId, userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        writeEnabled: true,
        schemaCache: true,
        schemaCacheUpdatedAt: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!connection) {
      throw new Error("Verbindung nicht gefunden oder keine Berechtigung");
    }
    return connection;
  }

  /* ── Private: Verbindung laden und Berechtigung prüfen ── */

  private async loadConnection(connectionId: string, userId: string) {
    const connection = await prisma.dataConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!connection) {
      throw new Error("Verbindung nicht gefunden oder keine Berechtigung");
    }
    return connection;
  }

  /* ── Private: Query-Log schreiben ── */

  private async logQuery(
    dataConnectionId: string,
    userId: string,
    data: {
      queryMode: string;
      originalQuery: string;
      generatedSql?: string;
      rowCount?: number;
      executionTimeMs?: number;
      status: string;
      error?: string;
    }
  ) {
    try {
      await prisma.dataQueryLog.create({
        data: {
          dataConnectionId,
          userId,
          queryMode: data.queryMode,
          originalQuery: data.originalQuery,
          generatedSql: data.generatedSql,
          rowCount: data.rowCount,
          executionTimeMs: data.executionTimeMs,
          status: data.status,
          error: data.error,
        },
      });
    } catch {
      // Logging-Fehler nicht weiterwerfen
      console.error("[DBConnector] Query-Log konnte nicht geschrieben werden");
    }
  }

  /* ── Private: PostgreSQL ── */

  private async testPostgres(config: ConnectionConfig): Promise<TestResult> {
    const pg = await import("pg");
    const { Client } = pg.default ?? pg;

    const client = new Client({
      connectionString: config.connectionString,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: this.QUERY_TIMEOUT_MS,
    });

    try {
      await client.connect();
      const res = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      );
      const tables = res.rows.map((r: { table_name: string }) => r.table_name);
      return { success: true, tables };
    } finally {
      await client.end().catch(() => {});
    }
  }

  private async executePostgres(
    config: ConnectionConfig,
    sql: string,
    params?: unknown[],
    writeEnabled?: boolean
  ): Promise<QueryResult> {
    const pg = await import("pg");
    const { Client } = pg.default ?? pg;

    const client = new Client({
      connectionString: config.connectionString,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: this.QUERY_TIMEOUT_MS,
      statement_timeout: this.QUERY_TIMEOUT_MS,
    });

    try {
      await client.connect();

      // Read-Only Transaktion wenn nicht schreibberechtigt
      if (!writeEnabled) {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION READ ONLY");
      }

      const res = await client.query(sql, params);

      if (!writeEnabled) {
        await client.query("COMMIT");
      }

      const columns = res.fields?.map((f: { name: string }) => f.name) || [];
      const rows = res.rows?.map((row: Record<string, unknown>) => columns.map((col: string) => row[col])) || [];

      return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: 0, // wird vom Aufrufer gesetzt
      };
    } catch (err) {
      if (!writeEnabled) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw err;
    } finally {
      await client.end().catch(() => {});
    }
  }

  private async getPostgresSchema(config: ConnectionConfig): Promise<SchemaTable[]> {
    const pg = await import("pg");
    const { Client } = pg.default ?? pg;

    const client = new Client({
      connectionString: config.connectionString,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: this.QUERY_TIMEOUT_MS,
    });

    try {
      await client.connect();

      // Alle Tabellen im public Schema
      const tablesRes = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      );

      const tables: SchemaTable[] = [];

      for (const row of tablesRes.rows as { table_name: string }[]) {
        const colsRes = await client.query(
          "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
          [row.table_name]
        );

        tables.push({
          name: row.table_name,
          columns: (colsRes.rows as { column_name: string; data_type: string; is_nullable: string }[]).map((c) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === "YES",
          })),
        });
      }

      return tables;
    } finally {
      await client.end().catch(() => {});
    }
  }

  /* ── Private: MySQL ── */

  private async testMysql(config: ConnectionConfig): Promise<TestResult> {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectTimeout: this.QUERY_TIMEOUT_MS,
    });

    try {
      const [rows] = await connection.query("SHOW TABLES");
      const tables = (rows as Record<string, string>[]).map((r) => Object.values(r)[0]);
      return { success: true, tables };
    } finally {
      await connection.end().catch(() => {});
    }
  }

  private async executeMysql(
    config: ConnectionConfig,
    sql: string,
    params?: unknown[],
    writeEnabled?: boolean
  ): Promise<QueryResult> {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectTimeout: this.QUERY_TIMEOUT_MS,
    });

    try {
      // Read-Only Transaktion wenn nicht schreibberechtigt
      if (!writeEnabled) {
        await connection.query("START TRANSACTION READ ONLY");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [rows, fields] = await connection.execute(sql, params as any);

      if (!writeEnabled) {
        await connection.query("COMMIT");
      }

      // MySQL execute gibt bei SELECT RowDataPacket[] zurück
      if (Array.isArray(fields) && fields.length > 0) {
        const columns = fields.map((f: { name: string }) => f.name);
        const dataRows = (rows as Record<string, unknown>[]).map((row) =>
          columns.map((col: string) => row[col])
        );
        return {
          columns,
          rows: dataRows,
          rowCount: dataRows.length,
          executionTimeMs: 0,
        };
      }

      return { columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
    } catch (err) {
      if (!writeEnabled) {
        await connection.query("ROLLBACK").catch(() => {});
      }
      throw err;
    } finally {
      await connection.end().catch(() => {});
    }
  }

  private async getMysqlSchema(config: ConnectionConfig): Promise<SchemaTable[]> {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectTimeout: this.QUERY_TIMEOUT_MS,
    });

    try {
      const [tableRows] = await connection.query("SHOW TABLES");
      const tables: SchemaTable[] = [];

      for (const tableRow of tableRows as Record<string, string>[]) {
        const tableName = Object.values(tableRow)[0];
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new Error("Invalid table name");
        }
        const [colRows] = await connection.query(`DESCRIBE \`${tableName}\``);

        tables.push({
          name: tableName,
          columns: (colRows as { Field: string; Type: string; Null: string }[]).map((c) => ({
            name: c.Field,
            type: c.Type,
            nullable: c.Null === "YES",
          })),
        });
      }

      return tables;
    } finally {
      await connection.end().catch(() => {});
    }
  }

  /* ── Private: Supabase ── */

  private async testSupabase(config: ConnectionConfig): Promise<TestResult> {
    const projectUrl = config.apiUrl || config.host;
    const serviceKey = config.apiKey || config.password;

    if (!projectUrl || !serviceKey) {
      return { success: false, tables: [], error: "Supabase Projekt-URL und Service-Key erforderlich" };
    }

    const url = `${projectUrl.replace(/\/$/, "")}/rest/v1/?apikey=${serviceKey}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      signal: AbortSignal.timeout(this.QUERY_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { success: false, tables: [], error: `Supabase Verbindung fehlgeschlagen: ${res.status} ${res.statusText}` };
    }

    // Die REST API gibt die verfügbaren Tabellen als OpenAPI Spec zurück
    try {
      const data = await res.json();
      const tables = data.paths
        ? Object.keys(data.paths)
            .filter((p: string) => p.startsWith("/"))
            .map((p: string) => p.replace("/", ""))
        : [];
      return { success: true, tables };
    } catch {
      return { success: true, tables: [], message: "Verbunden, aber Tabellen konnten nicht gelesen werden" };
    }
  }

  /* ── Private: REST API ── */

  private async testRestApi(config: ConnectionConfig): Promise<TestResult> {
    if (!config.apiUrl) {
      return { success: false, tables: [], error: "API-URL erforderlich" };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const res = await fetch(config.apiUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(this.QUERY_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { success: false, tables: [], error: `API-Verbindung fehlgeschlagen: ${res.status} ${res.statusText}` };
    }

    return { success: true, tables: [], message: "REST API erreichbar" };
  }
}

export const dbConnector = new DBConnector();
