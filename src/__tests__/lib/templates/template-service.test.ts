import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agentTemplate: { findMany: vi.fn(), findFirst: vi.fn() },
  workflowTemplate: { findMany: vi.fn(), findFirst: vi.fn() },
  templateInstance: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  agent: { create: vi.fn(), updateMany: vi.fn() },
  agentTeam: { create: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  installSelectedTemplatesForSubOrg,
  markTemplateInstanceCustomized,
  pushAgentTemplateUpdate,
  pushWorkflowTemplateUpdate,
  snapshotAgentConfig,
  snapshotWorkflowConfig,
} from "@/lib/templates/service";

const baseAgentConfig = {
  name: "Support Agent",
  systemPrompt: "Hilf freundlich.",
  suggestedQuestions: ["Frage"],
  llmModel: "claude-sonnet-4-6",
};

const baseWorkflowConfig = {
  name: "Support Workflow",
  goal: "Anfragen bearbeiten",
  config: { nodes: [], edges: [] },
};

describe("template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.agentTemplate.findMany.mockResolvedValue([]);
    mockPrisma.workflowTemplate.findMany.mockResolvedValue([]);
    mockPrisma.templateInstance.findFirst.mockResolvedValue(null);
    mockPrisma.templateInstance.create.mockResolvedValue({});
    mockPrisma.templateInstance.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.templateInstance.findMany.mockResolvedValue([]);
    mockPrisma.templateInstance.update.mockResolvedValue({});
    mockPrisma.agent.create.mockResolvedValue({ id: "agent_instance" });
    mockPrisma.agent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.agentTeam.create.mockResolvedValue({ id: "workflow_instance" });
    mockPrisma.agentTeam.updateMany.mockResolvedValue({ count: 1 });
  });

  it("installs no templates when selections are empty", async () => {
    const result = await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: [],
      workflowTemplateIds: [],
    });
    expect(result).toEqual({ agentInstanceIds: [], workflowInstanceIds: [], createdInstances: 0, reusedInstances: 0 });
  });

  it("loads selected agent templates from the agency org", async () => {
    mockPrisma.agentTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_agent", version: 3, agentConfig: baseAgentConfig },
    ]);
    await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: ["tpl_agent"],
      workflowTemplateIds: [],
    });
    expect(mockPrisma.agentTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ agencyOrgId: "org_agency", isPublished: true }),
    }));
  });

  it("creates an agent from an agent template", async () => {
    mockPrisma.agentTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_agent", version: 1, agentConfig: baseAgentConfig },
    ]);
    const result = await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: ["tpl_agent"],
      workflowTemplateIds: [],
    });
    expect(mockPrisma.agent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Support Agent", orgId: "org_child" }),
    }));
    expect(result.agentInstanceIds).toEqual(["agent_instance"]);
  });

  it("tracks created agent template instances", async () => {
    mockPrisma.agentTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_agent", version: 2, agentConfig: baseAgentConfig },
    ]);
    await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: ["tpl_agent"],
      workflowTemplateIds: [],
    });
    expect(mockPrisma.templateInstance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ templateType: "AGENT", templateVersion: 2, instanceId: "agent_instance" }),
    }));
  });

  it("reuses existing agent template instances", async () => {
    mockPrisma.agentTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_agent", version: 1, agentConfig: baseAgentConfig },
    ]);
    mockPrisma.templateInstance.findFirst.mockResolvedValueOnce({ instanceId: "existing_agent" });
    const result = await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: ["tpl_agent"],
      workflowTemplateIds: [],
    });
    expect(mockPrisma.agent.create).not.toHaveBeenCalled();
    expect(result.reusedInstances).toBe(1);
    expect(result.agentInstanceIds).toEqual(["existing_agent"]);
  });

  it("creates a workflow from a workflow template", async () => {
    mockPrisma.workflowTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_workflow", version: 1, workflowConfig: baseWorkflowConfig },
    ]);
    const result = await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: [],
      workflowTemplateIds: ["tpl_workflow"],
    });
    expect(mockPrisma.agentTeam.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Support Workflow", orgId: "org_child" }),
    }));
    expect(result.workflowInstanceIds).toEqual(["workflow_instance"]);
  });

  it("tracks created workflow template instances", async () => {
    mockPrisma.workflowTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_workflow", version: 4, workflowConfig: baseWorkflowConfig },
    ]);
    await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: [],
      workflowTemplateIds: ["tpl_workflow"],
    });
    expect(mockPrisma.templateInstance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ templateType: "WORKFLOW", templateVersion: 4, instanceId: "workflow_instance" }),
    }));
  });

  it("reuses existing workflow template instances", async () => {
    mockPrisma.workflowTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_workflow", version: 1, workflowConfig: baseWorkflowConfig },
    ]);
    mockPrisma.templateInstance.findFirst.mockResolvedValueOnce({ instanceId: "existing_workflow" });
    const result = await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: [],
      workflowTemplateIds: ["tpl_workflow"],
    });
    expect(mockPrisma.agentTeam.create).not.toHaveBeenCalled();
    expect(result.workflowInstanceIds).toEqual(["existing_workflow"]);
  });

  it("marks an agent template instance customized", async () => {
    mockPrisma.templateInstance.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(markTemplateInstanceCustomized({ templateType: "AGENT", instanceId: "agent_1", subOrgId: "org_child" })).resolves.toBe(1);
  });

  it("marks a workflow template instance customized", async () => {
    mockPrisma.templateInstance.updateMany.mockResolvedValueOnce({ count: 1 });
    await markTemplateInstanceCustomized({ templateType: "WORKFLOW", instanceId: "team_1", subOrgId: "org_child" });
    expect(mockPrisma.templateInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ templateType: "WORKFLOW", isCustomized: false }),
    }));
  });

  it("pushes agent template updates to non-customized instances", async () => {
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce({ id: "tpl_agent", version: 2, agentConfig: baseAgentConfig });
    mockPrisma.templateInstance.findMany.mockResolvedValueOnce([
      { id: "inst_1", instanceId: "agent_1", subOrgId: "org_child", isCustomized: false },
    ]);
    const result = await pushAgentTemplateUpdate({ agencyOrgId: "org_agency", templateId: "tpl_agent" });
    expect(result.updated).toBe(1);
    expect(mockPrisma.agent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "agent_1", orgId: "org_child" },
    }));
  });

  it("skips customized agent instances during push", async () => {
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce({ id: "tpl_agent", version: 2, agentConfig: baseAgentConfig });
    mockPrisma.templateInstance.findMany.mockResolvedValueOnce([
      { id: "inst_1", instanceId: "agent_1", subOrgId: "org_child", isCustomized: true },
    ]);
    const result = await pushAgentTemplateUpdate({ agencyOrgId: "org_agency", templateId: "tpl_agent" });
    expect(result.skippedCustomized).toBe(1);
    expect(mockPrisma.agent.updateMany).not.toHaveBeenCalled();
  });

  it("counts missing agent instances during push", async () => {
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce({ id: "tpl_agent", version: 2, agentConfig: baseAgentConfig });
    mockPrisma.templateInstance.findMany.mockResolvedValueOnce([
      { id: "inst_1", instanceId: "agent_1", subOrgId: "org_child", isCustomized: false },
    ]);
    mockPrisma.agent.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await pushAgentTemplateUpdate({ agencyOrgId: "org_agency", templateId: "tpl_agent" });
    expect(result.missingInstances).toBe(1);
  });

  it("throws when an agent template push target is missing", async () => {
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce(null);
    await expect(pushAgentTemplateUpdate({ agencyOrgId: "org_agency", templateId: "missing" })).rejects.toThrow("Template not found");
  });

  it("pushes workflow template updates to non-customized instances", async () => {
    mockPrisma.workflowTemplate.findFirst.mockResolvedValueOnce({ id: "tpl_workflow", version: 2, workflowConfig: baseWorkflowConfig });
    mockPrisma.templateInstance.findMany.mockResolvedValueOnce([
      { id: "inst_1", instanceId: "team_1", subOrgId: "org_child", isCustomized: false },
    ]);
    const result = await pushWorkflowTemplateUpdate({ agencyOrgId: "org_agency", templateId: "tpl_workflow" });
    expect(result.updated).toBe(1);
    expect(mockPrisma.agentTeam.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "team_1", orgId: "org_child" },
    }));
  });

  it("skips customized workflow instances during push", async () => {
    mockPrisma.workflowTemplate.findFirst.mockResolvedValueOnce({ id: "tpl_workflow", version: 2, workflowConfig: baseWorkflowConfig });
    mockPrisma.templateInstance.findMany.mockResolvedValueOnce([
      { id: "inst_1", instanceId: "team_1", subOrgId: "org_child", isCustomized: true },
    ]);
    const result = await pushWorkflowTemplateUpdate({ agencyOrgId: "org_agency", templateId: "tpl_workflow" });
    expect(result.skippedCustomized).toBe(1);
    expect(mockPrisma.agentTeam.updateMany).not.toHaveBeenCalled();
  });

  it("counts missing workflow instances during push", async () => {
    mockPrisma.workflowTemplate.findFirst.mockResolvedValueOnce({ id: "tpl_workflow", version: 2, workflowConfig: baseWorkflowConfig });
    mockPrisma.templateInstance.findMany.mockResolvedValueOnce([
      { id: "inst_1", instanceId: "team_1", subOrgId: "org_child", isCustomized: false },
    ]);
    mockPrisma.agentTeam.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await pushWorkflowTemplateUpdate({ agencyOrgId: "org_agency", templateId: "tpl_workflow" });
    expect(result.missingInstances).toBe(1);
  });

  it("throws when a workflow template push target is missing", async () => {
    mockPrisma.workflowTemplate.findFirst.mockResolvedValueOnce(null);
    await expect(pushWorkflowTemplateUpdate({ agencyOrgId: "org_agency", templateId: "missing" })).rejects.toThrow("Template not found");
  });

  it("snapshots agent config fields", () => {
    const snapshot = snapshotAgentConfig({
      name: "Agent",
      description: null,
      systemPrompt: "Prompt",
      personality: null,
      welcomeMessage: null,
      suggestedQuestions: [],
      llmModel: "claude",
      temperature: 0.4,
      modelProvider: "ANTHROPIC",
      status: "DRAFT",
      visibility: "PUBLIC",
      mode: "CHAT",
      triggerType: "MANUAL",
      triggerConfig: null,
      inputSchema: null,
      outputSchema: null,
      strictOutputValidation: false,
      approvalMode: "none",
      approvalConfig: null,
      whiteLabel: null,
      autoDetectLanguage: true,
      memoryEnabled: false,
      visitorMemoryEnabled: true,
      imageAnalysisEnabled: false,
      imageAutoActions: false,
      showAiDisclaimer: true,
      promptBranches: null,
      enableAgenticRag: false,
      agenticRagAutoApprove: false,
      agenticRagMinConfidence: 90,
      a2aEnabled: false,
      a2aCapabilities: [],
      codeExecutionEnabled: false,
    });
    expect(snapshot).toMatchObject({ name: "Agent", systemPrompt: "Prompt", llmModel: "claude" });
  });

  it("snapshots workflow config fields", () => {
    const snapshot = snapshotWorkflowConfig({
      name: "Workflow",
      description: "Desc",
      goal: "Goal",
      config: { nodes: [] },
      status: "ACTIVE",
      isSubWorkflow: false,
      parentWorkflowIds: [],
    });
    expect(snapshot).toMatchObject({ name: "Workflow", goal: "Goal", config: { nodes: [] } });
  });

  it("keeps mixed agent and workflow installs in one result", async () => {
    mockPrisma.agentTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_agent", version: 1, agentConfig: baseAgentConfig },
    ]);
    mockPrisma.workflowTemplate.findMany.mockResolvedValueOnce([
      { id: "tpl_workflow", version: 1, workflowConfig: baseWorkflowConfig },
    ]);
    const result = await installSelectedTemplatesForSubOrg({
      agencyOrgId: "org_agency",
      subOrgId: "org_child",
      userId: "user_1",
      agentTemplateIds: ["tpl_agent"],
      workflowTemplateIds: ["tpl_workflow"],
    });
    expect(result.createdInstances).toBe(2);
  });
});
