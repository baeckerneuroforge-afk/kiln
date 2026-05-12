/**
 * Sprint 19.7.5 — surfacing template updates available to a sub-org.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getAvailableAgentTemplateUpdates,
  getAvailableWorkflowTemplateUpdates,
} from "@/lib/sub-org/get-template-updates";

function makePrisma(opts: {
  instances?: Array<{
    templateType: "AGENT" | "WORKFLOW";
    templateId: string;
    templateVersion: number;
    instanceId: string;
    subOrgId: string;
    isCustomized?: boolean;
  }>;
  agentTemplates?: Array<{ id: string; name: string; version: number }>;
  workflowTemplates?: Array<{ id: string; name: string; version: number }>;
}) {
  return {
    templateInstance: {
      findMany: vi.fn().mockResolvedValue(
        (opts.instances ?? []).map((i) => ({ isCustomized: false, ...i })),
      ),
    },
    agentTemplate: {
      findMany: vi.fn().mockResolvedValue(opts.agentTemplates ?? []),
    },
    workflowTemplate: {
      findMany: vi.fn().mockResolvedValue(opts.workflowTemplates ?? []),
    },
  } as unknown as Parameters<typeof getAvailableAgentTemplateUpdates>[1];
}

describe("getAvailableAgentTemplateUpdates", () => {
  it("returns nothing when no instances are installed", async () => {
    const updates = await getAvailableAgentTemplateUpdates("org_child", makePrisma({}));
    expect(updates).toEqual([]);
  });

  it("returns nothing when the template version equals the instance version", async () => {
    const updates = await getAvailableAgentTemplateUpdates(
      "org_child",
      makePrisma({
        instances: [
          { templateType: "AGENT", templateId: "t1", templateVersion: 3, instanceId: "a1", subOrgId: "org_child" },
        ],
        agentTemplates: [{ id: "t1", name: "Greeter", version: 3 }],
      }),
    );
    expect(updates).toEqual([]);
  });

  it("flags templates with a newer published version", async () => {
    const updates = await getAvailableAgentTemplateUpdates(
      "org_child",
      makePrisma({
        instances: [
          { templateType: "AGENT", templateId: "t1", templateVersion: 1, instanceId: "a1", subOrgId: "org_child" },
          { templateType: "AGENT", templateId: "t2", templateVersion: 2, instanceId: "a2", subOrgId: "org_child" },
        ],
        agentTemplates: [
          { id: "t1", name: "Greeter", version: 3 },
          { id: "t2", name: "Booker", version: 2 },
        ],
      }),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      templateId: "t1",
      templateName: "Greeter",
      currentVersion: 1,
      latestVersion: 3,
      isCustomized: false,
    });
  });

  it("propagates isCustomized through to the caller", async () => {
    const updates = await getAvailableAgentTemplateUpdates(
      "org_child",
      makePrisma({
        instances: [
          { templateType: "AGENT", templateId: "t1", templateVersion: 1, instanceId: "a1", subOrgId: "org_child", isCustomized: true },
        ],
        agentTemplates: [{ id: "t1", name: "Greeter", version: 2 }],
      }),
    );
    expect(updates[0].isCustomized).toBe(true);
  });

  it("skips instances whose template has been unpublished or deleted", async () => {
    const updates = await getAvailableAgentTemplateUpdates(
      "org_child",
      makePrisma({
        instances: [
          { templateType: "AGENT", templateId: "missing", templateVersion: 1, instanceId: "a1", subOrgId: "org_child" },
        ],
        // agentTemplates.findMany filters by isPublished:true, so an
        // unpublished or deleted template returns an empty list here.
        agentTemplates: [],
      }),
    );
    expect(updates).toEqual([]);
  });
});

describe("getAvailableWorkflowTemplateUpdates", () => {
  it("queries workflowTemplate instead of agentTemplate", async () => {
    const prisma = makePrisma({
      instances: [
        { templateType: "WORKFLOW", templateId: "w1", templateVersion: 1, instanceId: "team_1", subOrgId: "org_child" },
      ],
      workflowTemplates: [{ id: "w1", name: "Sales Flow", version: 4 }],
    });
    const updates = await getAvailableWorkflowTemplateUpdates("org_child", prisma);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ templateType: "WORKFLOW", templateName: "Sales Flow" });
  });
});
