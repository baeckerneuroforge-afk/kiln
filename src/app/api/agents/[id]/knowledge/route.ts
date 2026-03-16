import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  chunkText,
  generateEmbeddings,
  storeChunks,
  fetchUrlContent,
} from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";

// Load knowledge base entries
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const entries = await prisma.knowledgeBase.findMany({
      where: { agentId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Background: process text → chunks → embeddings → store
async function processKnowledgeEntry(
  kbId: string,
  agentId: string,
  userId: string,
  textContent: string
) {
  try {
    const chunks = chunkText(textContent);
    const embeddings = await generateEmbeddings(chunks);
    await storeChunks(kbId, agentId, chunks, embeddings);

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        chunkCount: chunks.length,
        embeddingStatus: "READY",
      },
    });

    // Deduct embedding credits (fire-and-forget)
    deductEmbeddingCredits(userId, chunks.length, agentId).catch((err) => {
      console.error("Knowledge embedding credit deduction failed:", err);
    });
  } catch (err) {
    console.error(`Knowledge embedding failed for ${kbId}:`, err instanceof Error ? err.message : err);
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { embeddingStatus: "ERROR" },
    }).catch(() => {});
  }
}

// Create new knowledge base entry + process async
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";

    let type: "PDF" | "URL" | "FAQ" | "TEXT";
    let sourceName: string;
    let textContent: string;

    if (contentType.includes("multipart/form-data")) {
      // PDF Upload — parse synchronously (needs request body), embed async
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return Response.json(
          { error: "No file uploaded" },
          { status: 400 }
        );
      }

      type = "PDF";
      sourceName = file.name;

      // Upload to Supabase Storage
      const supabase = getSupabaseAdmin();
      const filePath = `knowledge/${params.id}/${Date.now()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(filePath, buffer, {
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(`Upload error: ${uploadError.message}`);
      }

      // Extract PDF text
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse");
      const pdfData = await pdfParse(buffer);
      textContent = pdfData.text;
    } else {
      // JSON Body: URL, FAQ, or Text
      const body = await request.json();

      if (body.type === "URL") {
        type = "URL";
        sourceName = body.url;
        // URL fetch happens synchronously so we can validate content before creating the KB entry
        textContent = await fetchUrlContent(body.url);
      } else if (body.type === "FAQ") {
        type = "FAQ";
        sourceName = body.title || "FAQ";
        textContent = (body.pairs || [])
          .map(
            (p: { question: string; answer: string }) =>
              `Frage: ${p.question}\nAntwort: ${p.answer}`
          )
          .join("\n\n");
      } else {
        type = "TEXT";
        sourceName = body.title || "Text";
        textContent = body.content || "";
      }
    }

    if (!textContent.trim()) {
      return Response.json(
        { error: "No text content extracted" },
        { status: 400 }
      );
    }

    // Create KB entry with PROCESSING status
    const kb = await prisma.knowledgeBase.create({
      data: {
        agentId: params.id,
        type,
        sourceName,
        content: textContent.slice(0, 50000),
        embeddingStatus: "PROCESSING",
      },
    });

    // Run heavy embedding work in background via waitUntil
    waitUntil(processKnowledgeEntry(kb.id, params.id, userId, textContent));

    // Return immediately with 202
    return Response.json(
      { ...kb, status: "processing", id: kb.id },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
