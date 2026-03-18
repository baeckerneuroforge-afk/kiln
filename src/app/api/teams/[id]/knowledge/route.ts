import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  chunkText,
  generateEmbeddings,
  storeTeamChunks,
  fetchUrlContent,
} from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";

// List team knowledge base entries
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const entries = await prisma.knowledgeBase.findMany({
      where: { teamId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Background: process text → chunks → embeddings → store
async function processTeamKnowledgeEntry(
  kbId: string,
  teamId: string,
  userId: string,
  textContent: string
) {
  try {
    const chunks = chunkText(textContent);
    const embeddings = await generateEmbeddings(chunks);
    await storeTeamChunks(kbId, teamId, chunks, embeddings);

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: {
        chunkCount: chunks.length,
        embeddingStatus: "READY",
      },
    });

    deductEmbeddingCredits(userId, chunks.length).catch((err) => {
      console.error("Team KB embedding credit deduction failed:", err);
    });
  } catch (err) {
    console.error(`Team KB embedding failed for ${kbId}:`, err instanceof Error ? err.message : err);
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { embeddingStatus: "ERROR" },
    }).catch(() => {});
  }
}

// Upload document to team KB
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";

    let type: "PDF" | "URL" | "FAQ" | "TEXT";
    let sourceName: string;
    let textContent: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return Response.json({ error: "No file uploaded" }, { status: 400 });
      }

      type = "PDF";
      sourceName = file.name;

      const supabase = getSupabaseAdmin();
      const filePath = `knowledge/team_${params.id}/${Date.now()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(filePath, buffer, { contentType: file.type });

      if (uploadError) {
        throw new Error(`Upload error: ${uploadError.message}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse");
      const pdfData = await pdfParse(buffer);
      textContent = pdfData.text;
    } else {
      const body = await request.json();

      if (body.type === "URL") {
        type = "URL";
        sourceName = body.url;
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
      return Response.json({ error: "No text content extracted" }, { status: 400 });
    }

    const kb = await prisma.knowledgeBase.create({
      data: {
        teamId: params.id,
        type,
        sourceName,
        content: textContent.slice(0, 50000),
        embeddingStatus: "PROCESSING",
      },
    });

    waitUntil(processTeamKnowledgeEntry(kb.id, params.id, userId, textContent));

    return Response.json(
      { ...kb, status: "processing", id: kb.id },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
