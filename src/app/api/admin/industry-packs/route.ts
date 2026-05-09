import { auth } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!isAdmin(userId)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const [templates, relationships] = await Promise.all([
    prisma.industryTemplate.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.orgRelationship.findMany({
      where: { industry: { not: null } },
      select: { industry: true },
    }),
  ]);

  const usageByIndustry = new Map<string, number>();
  for (const relationship of relationships) {
    if (!relationship.industry) continue;
    usageByIndustry.set(relationship.industry, (usageByIndustry.get(relationship.industry) ?? 0) + 1);
  }

  return Response.json({
    packs: templates.map((template) => ({
      id: template.id,
      industry: template.industry,
      displayName: template.displayName,
      displayNameDe: template.displayNameDe,
      description: template.description,
      descriptionDe: template.descriptionDe,
      departmentCount: Array.isArray(template.departmentTemplates) ? template.departmentTemplates.length : 0,
      knowledgeBaseSeedCount: Array.isArray(template.knowledgeBaseSeeds) ? template.knowledgeBaseSeeds.length : 0,
      channelCount: Array.isArray(template.recommendedChannels) ? template.recommendedChannels.length : 0,
      customerCount: usageByIndustry.get(template.industry) ?? 0,
      isActive: template.isActive,
      iconName: template.iconName,
      metadata: template.metadata,
      updatedAt: template.updatedAt.toISOString(),
    })),
  });
}
