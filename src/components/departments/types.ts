export interface DepartmentWorkerView {
  id: string;
  role: string;
  description: string | null;
  priority: number;
  agent: {
    id: string;
    name: string;
    status?: string;
    systemPrompt?: string;
    llmModel?: string;
  };
}

export interface DepartmentView {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  approvalMode: string;
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  webhookEnabled: boolean;
  webhookSecret?: string;
  totalTasks: number;
  totalApprovals: number;
  operatingMemory?: unknown;
  workerAgents?: DepartmentWorkerView[];
  _count?: { backlog?: number; runLogs?: number };
  createdAt: string;
}

export interface BacklogItemView {
  id: string;
  triggerType: string;
  triggerPayload: unknown;
  status: string;
  result: unknown;
  error: string | null;
  approvalDraft: unknown;
  createdAt: string;
}

export interface RunLogView {
  id: string;
  managerDecision: unknown;
  workerInvoked: string | null;
  invocationType: string;
  durationMs: number;
  tokensUsed: number;
  createdAt: string;
}
