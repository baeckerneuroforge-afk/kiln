import type { Prisma } from "@prisma/client";

export type TemplateType = "AGENT" | "WORKFLOW" | "DEPARTMENT";

export type AgentTemplateConfig = {
  name: string;
  description?: string | null;
  systemPrompt: string;
  personality?: Prisma.JsonValue | null;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  llmModel?: string;
  temperature?: number;
  modelProvider?: string;
  status?: string;
  visibility?: string;
  mode?: string;
  triggerType?: string;
  triggerConfig?: Prisma.JsonValue | null;
  inputSchema?: Prisma.JsonValue | null;
  outputSchema?: Prisma.JsonValue | null;
  strictOutputValidation?: boolean;
  approvalMode?: string;
  approvalConfig?: Prisma.JsonValue | null;
  whiteLabel?: Prisma.JsonValue | null;
  autoDetectLanguage?: boolean;
  memoryEnabled?: boolean;
  visitorMemoryEnabled?: boolean;
  imageAnalysisEnabled?: boolean;
  imageAutoActions?: boolean;
  showAiDisclaimer?: boolean;
  promptBranches?: Prisma.JsonValue | null;
  enableAgenticRag?: boolean;
  agenticRagAutoApprove?: boolean;
  agenticRagMinConfidence?: number;
  a2aEnabled?: boolean;
  a2aCapabilities?: string[];
  codeExecutionEnabled?: boolean;
};

export type WorkflowTemplateConfig = {
  name: string;
  description?: string | null;
  goal?: string | null;
  config?: Prisma.JsonValue | null;
  status?: string;
  isSubWorkflow?: boolean;
  parentWorkflowIds?: string[];
};

export type TemplateInstallResult = {
  agentInstanceIds: string[];
  workflowInstanceIds: string[];
  createdInstances: number;
  reusedInstances: number;
};

export type TemplatePushResult = {
  templateId: string;
  templateType: Exclude<TemplateType, "DEPARTMENT">;
  updated: number;
  skippedCustomized: number;
  missingInstances: number;
};
