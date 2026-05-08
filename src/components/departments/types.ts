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
  emailEnabled: boolean;
  emailInboundAddr: string | null;
  emailFromAddr: string | null;
  emailFromName: string | null;
  emailReplyToAddr: string | null;
  whatsappEnabled: boolean;
  whatsappPhoneId: string | null;
  whatsappBusinessId: string | null;
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

export interface DepartmentChannelMessageView {
  id: string;
  departmentId: string;
  backlogItemId: string | null;
  channel: "EMAIL" | "WHATSAPP";
  direction: "INBOUND" | "OUTBOUND";
  emailMessageId: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  emailSubject: string | null;
  emailHeaders: unknown;
  emailBody: string | null;
  whatsappMessageId: string | null;
  whatsappFrom: string | null;
  whatsappTo: string | null;
  whatsappBody: string | null;
  whatsappType: string | null;
  whatsappMediaId: string | null;
  status: string;
  blockedReason: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  externalId: string | null;
  createdAt: string;
}
