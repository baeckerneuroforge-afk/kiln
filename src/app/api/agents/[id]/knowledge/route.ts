import { NextRequest } from "next/server";
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

// Create new knowledge base entry + process
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
      // PDF Upload
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

      const {
        data: { publicUrl },
      } = supabase.storage.from("knowledge-files").getPublicUrl(filePath);
      // fileUrl available for later reference
      void publicUrl;

      // Extract PDF text (pdf-parse v1 — using lib/pdf-parse directly to avoid test-PDF bug)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse");
      const pdfData = await pdfParse(buffer);
      textContent = pdfData.text;
    } else {
      // JSON Body: URL oder Text
      const body = await request.json();

      if (body.type === "URL") {
        type = "URL";
        sourceName = body.url;
        textContent = await fetchUrlContent(body.url);
      } else if (body.type === "FAQ") {
        type = "FAQ";
        sourceName = body.title || "FAQ";
        // FAQ formatted as Q&A pairs
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

    // Create KB entry in Prisma (status: PROCESSING)
    const kb = await prisma.knowledgeBase.create({
      data: {
        agentId: params.id,
        type,
        sourceName,
        content: textContent.slice(0, 50000), // Max 50k characters
        embeddingStatus: "PROCESSING",
      },
    });

    // Async: Chunking + Embedding (in background, but we await it)
    try {
      const chunks = chunkText(textContent);
      const embeddings = await generateEmbeddings(chunks);
      await storeChunks(kb.id, params.id, chunks, embeddings);

      // Set status to READY
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: {
          chunkCount: chunks.length,
          embeddingStatus: "READY",
        },
      });

      // Deduct embedding credits (1 per 10 chunks, fire-and-forget)
      if (userId) {
        deductEmbeddingCredits(userId, chunks.length, params.id).catch(() => {});
      }

      return Response.json({
        ...kb,
        chunkCount: chunks.length,
        embeddingStatus: "READY",
      });
    } catch (embeddingError) {
      // Embedding failed → status ERROR
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { embeddingStatus: "ERROR" },
      });

      const errMsg =
        embeddingError instanceof Error
          ? embeddingError.message
          : "Embedding error";
      return Response.json(
        { ...kb, embeddingStatus: "ERROR", error: errMsg },
        { status: 200 } // 200 because KB was created, only embedding failed
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
