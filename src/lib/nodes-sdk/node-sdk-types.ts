/**
 * Custom Node SDK — Typdefinitionen
 * Ermoeglicht Community-Entwicklern, eigene Workflow-Nodes zu erstellen.
 */

/* ── Port & Config ── */

export type NodePortType = "string" | "number" | "json" | "boolean" | "array" | "any";

export interface NodePort {
  name: string;
  type: NodePortType;
  description: string;
}

export type NodeConfigFieldType = "text" | "number" | "select" | "toggle" | "textarea" | "password";

export interface NodeConfigField {
  name: string;
  type: NodeConfigFieldType;
  label: string;
  description?: string;
  options?: string[];
  default?: unknown;
  required?: boolean;
}

/* ── Helper Interfaces ── */

export interface CreditHelper {
  /** Aktuelle Credit-Balance pruefen */
  checkBalance(): Promise<number>;
  /** Credits abziehen */
  deductCredits(amount: number, reason: string): Promise<boolean>;
  /** Kosten fuer eine Operation schaetzen */
  estimateCost(operation: string): Promise<number>;
}

export interface LLMHelper {
  /** Text-Completion via Claude Haiku (guenstig) */
  complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
  /** Completion mit Bild-Input */
  completeWithVision(prompt: string, imageUrl: string, options?: { maxTokens?: number }): Promise<string>;
}

export interface HTTPHelper {
  /** GET Request (nur HTTPS, kein localhost) */
  get(url: string, headers?: Record<string, string>): Promise<HTTPResponse>;
  /** POST Request */
  post(url: string, body: unknown, headers?: Record<string, string>): Promise<HTTPResponse>;
  /** PUT Request */
  put(url: string, body: unknown, headers?: Record<string, string>): Promise<HTTPResponse>;
  /** DELETE Request */
  delete(url: string, headers?: Record<string, string>): Promise<HTTPResponse>;
}

export interface HTTPResponse {
  status: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface StorageHelper {
  /** Wert lesen (pro Node/User isoliert) */
  get(key: string): Promise<unknown | null>;
  /** Wert schreiben */
  set(key: string, value: unknown): Promise<void>;
  /** Wert loeschen */
  delete(key: string): Promise<void>;
}

/* ── Execution Context ── */

export interface NodeExecutionContext {
  input: Record<string, unknown>;
  config: Record<string, unknown>;
  agentId: string;
  userId: string;
  credits: CreditHelper;
  llm: LLMHelper;
  http: HTTPHelper;
  storage: StorageHelper;
}

/* ── Result ── */

export interface NodeResult {
  output: Record<string, unknown>;
  status: "success" | "error";
  error?: string;
  creditsUsed?: number;
}

/* ── Node Definition ── */

export interface CustomNodeDefinition {
  /** Namespaced ID: "creator/node-name" */
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  version: string;
  inputs: NodePort[];
  outputs: NodePort[];
  config: NodeConfigField[];
  /** Execute-Funktion als String (wird im Sandbox-Kontext ausgefuehrt) */
  executeCode: string;
}

/* ── Serializable Definition (for DB storage) ── */

export interface CustomNodeDefinitionJSON {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  version: string;
  inputs: NodePort[];
  outputs: NodePort[];
  config: NodeConfigField[];
  executeCode: string;
}

/* ── Custom Node Status ── */

export type CustomNodeStatus = "draft" | "pending_review" | "published" | "rejected";
