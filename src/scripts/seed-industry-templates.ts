import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { INDUSTRY_TEMPLATES, toIndustryTemplateRow } from "../lib/onboarding/industry-templates";

const prisma = new PrismaClient();

async function main() {
  for (const template of INDUSTRY_TEMPLATES) {
    const data = toIndustryTemplateRow(template);
    const prismaData = {
      ...data,
      departmentTemplates: data.departmentTemplates as unknown as Prisma.InputJsonValue,
      knowledgeBaseSeeds: data.knowledgeBaseSeeds as unknown as Prisma.InputJsonValue,
      recommendedChannels: data.recommendedChannels as unknown as Prisma.InputJsonValue,
    };
    await prisma.industryTemplate.upsert({
      where: { industry: data.industry },
      update: prismaData,
      create: prismaData,
    });
  }
  console.log(`Seeded ${INDUSTRY_TEMPLATES.length} industry templates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
