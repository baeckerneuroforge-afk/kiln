export type ReplayTaskStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED"
  | "AWAITING_APPROVAL"
  | "REJECTED";

export type ReplayAgentMode = "CHAT" | "TASK" | "APPROVAL";

export interface ReplayPreviousOutput {
  taskIndex: number;
  title: string;
  output: string;
}

export interface ReplayPromptData {
  system: string;
  user: string;
  fullPrompt: string;
  knowledgeContext: string[];
}

export interface ReplayRoutingData {
  type: "retry" | "approval" | "orchestration" | "sequence" | "none";
  decision: string;
  condition: string | null;
  comparison: string | null;
  nextMemberId: string | null;
  nextMemberName: string | null;
}

export interface ReplayMetrics {
  tokensIn: number;
  tokensOut: number;
  model: string | null;
  estimatedCost: number | null;
  responseTimeMs: number | null;
}

export interface ReplayApprovalRequest {
  id: string;
  taskIndex: number;
  status: string;
  approverEmail: string;
  requestedAt: string;
  respondedAt: string | null;
  respondedBy: string | null;
  note: string | null;
  gateMemberId: string | null;
  gateMemberName: string | null;
}

export interface ReplayMember {
  id: string;
  agentId: string | null;
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER" | "APPROVAL_GATE";
  level: number;
  responsibilities: string | null;
  agentMode: ReplayAgentMode;
  llmModel: string | null;
  modelProvider: string | null;
  systemPrompt: string | null;
  reportsToMemberId: string | null;
  outputSchema: unknown;
  enabledActions: string[];
  config: Record<string, unknown>;
}

export interface ReplayConnection {
  sourceMemberId: string;
  sourceMemberName: string;
  targetMemberId: string;
  targetMemberName: string;
  condition: string;
  enabled: boolean;
}

export interface ReplayStep {
  id: string;
  taskIndex: number;
  taskId: string | null;
  taskTitle: string;
  priority: string;
  attempt: number;
  memberId: string | null;
  memberName: string;
  role: ReplayMember["role"] | null;
  agentId: string | null;
  status: ReplayTaskStatus;
  startedAt: string | null;
  completedAt: string | null;
  input: unknown;
  output: string | null;
  structuredOutput: Record<string, unknown>;
  error: string | null;
  previousOutputs: ReplayPreviousOutput[];
  sharedContextBefore: Record<string, unknown>;
  sharedContextAfter: Record<string, unknown>;
  sharedContextDelta: Record<string, unknown>;
  prompt: ReplayPromptData;
  routing: ReplayRoutingData;
  metrics: ReplayMetrics;
  approvalRequest: ReplayApprovalRequest | null;
  commonFixSuggestions: string[];
}

export interface TeamExecutionReplayResponse {
  execution: {
    id: string;
    teamId: string;
    status: string;
    goal: string | null;
    startedAt: string;
    completedAt: string | null;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    executionContext: Record<string, unknown>;
  };
  team: {
    id: string;
    name: string;
    goal: string | null;
    description: string | null;
    savedPositions: Record<string, { x: number; y: number }>;
    members: ReplayMember[];
    connections: ReplayConnection[];
  };
  steps: ReplayStep[];
  approvalRequests: ReplayApprovalRequest[];
}
