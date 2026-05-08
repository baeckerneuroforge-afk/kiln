import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chunkText } from "@/lib/rag";
import { scrapeWebsitePages } from "@/lib/onboarding/kb-website-scraper";
import type { WizardKnowledgeConfig } from "@/lib/onboarding/types";

export interface KbImportResult {
  indexed: number;
  warnings: string[];
}

async function extractPdfText(base64: string, fileName: string): Promise<{ text: string; warning?: string }> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = Buffer.from(base64, "base64");
    const result = await pdfParse(buffer);
    return { text: result.text.trim() };
  } catch (err) {
    return {
      text: "",
      warning: `${fileName}: ${err instanceof Error ? err.message : "invalid PDF"}`,
    };
  }
}

async function createKnowledgeEntry(args: {
  orgId: string;
  type: "PDF" | "URL" | "FAQ" | "TEXT";
  sourceName: string;
  content: string;
}): Promise<void> {
  const chunks = chunkText(args.content);
  await prisma.knowledgeBase.create({
    data: {
      orgId: args.orgId,
      type: args.type,
      sourceName: args.sourceName,
      content: args.content.slice(0, 50000),
      chunkCount: chunks.length,
      embeddingStatus: "READY",
    },
  });
}

export async function importKnowledgeForSubOrg(args: {
  orgId: string;
  config: WizardKnowledgeConfig;
  seedEntries?: { title: string; content: string }[];
}): Promise<KbImportResult> {
  const warnings: string[] = [];
  let indexed = 0;

  const seeds = args.seedEntries ?? [];
  await Promise.all(
    seeds.map(async (seed) => {
      await createKnowledgeEntry({
        orgId: args.orgId,
        type: "FAQ",
        sourceName: seed.title,
        content: seed.content,
      });
      indexed += 1;
    })
  );

  const files = (args.config.files ?? []).slice(0, 50);
  const totalBytes = files.reduce((sum, file) => sum + (file.contentBase64 ? Buffer.byteLength(file.contentBase64, "base64") : Buffer.byteLength(file.textContent ?? "")), 0);
  if (totalBytes > 100 * 1024 * 1024) {
    warnings.push("Knowledge upload exceeds 100MB total; files were skipped.");
  } else {
    await Promise.all(
      files.map(async (file) => {
        const textResult = file.mimeType === "application/pdf" && file.contentBase64
          ? await extractPdfText(file.contentBase64, file.fileName)
          : { text: file.textContent ?? "" };
        if (textResult.warning) {
          warnings.push(textResult.warning);
          return;
        }
        if (!textResult.text.trim()) {
          warnings.push(`${file.fileName}: no text content extracted`);
          return;
        }
        await createKnowledgeEntry({
          orgId: args.orgId,
          type: file.mimeType === "application/pdf" ? "PDF" : "TEXT",
          sourceName: file.fileName,
          content: textResult.text,
        });
        indexed += 1;
      })
    );
  }

  const pages = await scrapeWebsitePages(args.config.urls ?? []);
  await Promise.all(
    pages.map(async (page) => {
      if (page.error || !page.content.trim()) {
        warnings.push(`${page.url}: ${page.error ?? "no readable content"}`);
        return;
      }
      await createKnowledgeEntry({
        orgId: args.orgId,
        type: "URL",
        sourceName: page.title,
        content: page.content,
      });
      indexed += 1;
    })
  );

  return { indexed, warnings };
}

export function knowledgeConfigToJson(config: WizardKnowledgeConfig): Prisma.InputJsonValue {
  return config as unknown as Prisma.InputJsonValue;
}
