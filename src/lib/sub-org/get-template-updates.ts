/**
 * Sprint 19.7.5 — find Agent/Workflow templates with a newer version
 * available than what's currently installed in the sub-org. Used by the
 * sub-org agents + workflows pages to render an update banner.
 *
 * `clerkOrgId` is the OrgRelationship.childOrgId (= the sub-org's Clerk
 * org id), matching what TemplateInstance.subOrgId stores.
 */
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export interface AvailableTemplateUpdate {
  templateType: "AGENT" | "WORKFLOW";
  templateId: string;
  templateName: string;
  currentVersion: number;
  latestVersion: number;
  /** TemplateInstance.instanceId — the Agent or AgentTeam id in the sub-org. */
  instanceId: string;
  isCustomized: boolean;
}

type PrismaLike = Pick<PrismaClient, "templateInstance" | "agentTemplate" | "workflowTemplate">;

export async function getAvailableAgentTemplateUpdates(
  clerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<AvailableTemplateUpdate[]> {
  return getUpdatesFor("AGENT", clerkOrgId, prisma);
}

export async function getAvailableWorkflowTemplateUpdates(
  clerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<AvailableTemplateUpdate[]> {
  return getUpdatesFor("WORKFLOW", clerkOrgId, prisma);
}

async function getUpdatesFor(
  type: "AGENT" | "WORKFLOW",
  clerkOrgId: string,
  prisma: PrismaLike,
): Promise<AvailableTemplateUpdate[]> {
  const instances = await prisma.templateInstance.findMany({
    where: { templateType: type, subOrgId: clerkOrgId },
  });
  if (instances.length === 0) return [];

  const templateIds = [...new Set(instances.map((i) => i.templateId))];

  // Pull current published version + name for each template. We only
  // surface updates when isPublished — the agency may have an in-progress
  // edit they aren't ready to ship yet.
  const templates = type === "AGENT"
    ? await prisma.agentTemplate.findMany({
        where: { id: { in: templateIds }, isPublished: true },
        select: { id: true, name: true, version: true },
      })
    : await prisma.workflowTemplate.findMany({
        where: { id: { in: templateIds }, isPublished: true },
        select: { id: true, name: true, version: true },
      });

  const byId = new Map(templates.map((t) => [t.id, t]));
  const out: AvailableTemplateUpdate[] = [];

  for (const instance of instances) {
    const template = byId.get(instance.templateId);
    if (!template) continue;
    if (template.version <= instance.templateVersion) continue;
    out.push({
      templateType: type,
      templateId: instance.templateId,
      templateName: template.name,
      currentVersion: instance.templateVersion,
      latestVersion: template.version,
      instanceId: instance.instanceId,
      isCustomized: instance.isCustomized,
    });
  }

  return out;
}
