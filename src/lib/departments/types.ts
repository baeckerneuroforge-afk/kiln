import type {
  Department,
  DepartmentBacklogItem,
  DepartmentRunLog,
  DepartmentWorker,
  TriggerType,
} from "@prisma/client";

export type JsonRecord = Record<string, unknown>;

export interface TriggerEvent {
  triggerType: TriggerType;
  payload: JsonRecord;
}

export interface DepartmentContext {
  departmentId: string;
  orgId: string;
  userId: string;
  backlogItemId?: string;
  approverUserId?: string;
}

export type SwarmConfig = JsonRecord;

export type ManagerDecision =
  | { type: "INVOKE_WORKER"; workerId: string; input: JsonRecord }
  | { type: "INVOKE_WORKFLOW"; workflowId: string; input: JsonRecord }
  | { type: "INVOKE_SWARM"; swarmConfig: SwarmConfig; input: JsonRecord }
  | { type: "REQUEST_APPROVAL"; draftedAction: JsonRecord }
  | { type: "UPDATE_MEMORY"; patch: JsonRecord }
  | { type: "MARK_DONE"; result: JsonRecord }
  | { type: "FOLLOWUP_LATER"; scheduledFor: string; payload: JsonRecord };

export interface ManagerDecisionResult {
  decision: ManagerDecision;
  tokensUsed: number;
  raw: unknown;
}

export type DepartmentWithWorkers = Department & {
  workerAgents: DepartmentWorker[];
};

export type DepartmentManagerArgs = {
  department: Department;
  backlogItem: DepartmentBacklogItem;
  operatingMemory: JsonRecord;
  availableWorkers: DepartmentWorker[];
  recentRunLogs: DepartmentRunLog[];
};

export type InvocationResult = {
  ok: boolean;
  invocationType: "AGENT" | "WORKFLOW" | "SWARM" | "DRAFT";
  output?: unknown;
  error?: string;
  runId?: string;
  durationMs: number;
};
