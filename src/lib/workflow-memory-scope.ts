export type WorkflowMemoryScope = "AGENT" | "WORKFLOW" | "GLOBAL";

export function normalizeWorkflowMemoryScope(value: unknown): WorkflowMemoryScope {
  const normalized = String(value || "AGENT").toUpperCase();
  if (normalized === "WORKFLOW" || normalized === "WORKFLOW_SHARED") return "WORKFLOW";
  if (normalized === "GLOBAL") return "GLOBAL";
  return "AGENT";
}

export function buildScopedMemoryWhere(params: {
  agentId: string;
  sessionHash: string;
  workflowExecutionId?: string | null;
  scope?: WorkflowMemoryScope;
}) {
  const scope = normalizeWorkflowMemoryScope(params.scope);

  if (scope === "GLOBAL") {
    return {
      OR: [
        { scope: "GLOBAL" as const, sessionHash: params.sessionHash },
        { scope: "WORKFLOW" as const, workflowExecutionId: params.workflowExecutionId || "__none__" },
        { scope: "AGENT" as const, agentId: params.agentId, sessionHash: params.sessionHash },
      ],
    };
  }

  if (scope === "WORKFLOW") {
    return {
      OR: [
        { scope: "WORKFLOW" as const, workflowExecutionId: params.workflowExecutionId || "__none__" },
        { scope: "AGENT" as const, agentId: params.agentId, sessionHash: params.sessionHash },
      ],
    };
  }

  return {
    scope: "AGENT" as const,
    agentId: params.agentId,
    sessionHash: params.sessionHash,
  };
}

export function formatMemoryPrompt(memories: Array<{ key: string; value: string }>) {
  if (memories.length === 0) return "";
  return "\n\n---\nSCOPED MEMORY:\n" + memories.map((memory) => `- ${memory.key}: ${memory.value}`).join("\n");
}
