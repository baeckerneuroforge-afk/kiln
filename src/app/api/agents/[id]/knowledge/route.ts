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

// Knowledge Base Einträge laden
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const entries = await prisma.knowledgeBase.findMany({
      where: { agentId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Neuen Knowledge Base Eintrag erstellen + verarbeiten
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
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
          { error: "Keine Datei hochgeladen" },
          { status: 400 }
        );
      }

      type = "PDF";
      sourceName = file.name;

      // In Supabase Storage hochladen
      const supabase = getSupabaseAdmin();
      const filePath = `knowledge/${params.id}/${Date.now()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(filePath, buffer, {
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(`Upload-Fehler: ${uploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("knowledge-files").getPublicUrl(filePath);
      // fileUrl für spätere Referenz verfügbar
      void publicUrl;

      // PDF Text extrahieren (pdf-parse v1 — lib/pdf-parse direkt um Test-PDF-Bug zu umgehen)
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
        // FAQ als Q&A-Paare formatiert
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
        { error: "Kein Textinhalt extrahiert" },
        { status: 400 }
      );
    }

    // KB-Eintrag in Prisma erstellen (Status: PROCESSING)
    const kb = await prisma.knowledgeBase.create({
      data: {
        agentId: params.id,
        type,
        sourceName,
        content: textContent.slice(0, 50000), // Max 50k Zeichen Content
        embeddingStatus: "PROCESSING",
      },
    });

    // Async: Chunking + Embedding (im Hintergrund, aber wir warten drauf)
    try {
      const chunks = chunkText(textContent);
      const embeddings = await generateEmbeddings(chunks);
      await storeChunks(kb.id, params.id, chunks, embeddings);

      // Status auf READY setzen
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: {
          chunkCount: chunks.length,
          embeddingStatus: "READY",
        },
      });

      return Response.json({
        ...kb,
        chunkCount: chunks.length,
        embeddingStatus: "READY",
      });
    } catch (embeddingError) {
      // Embedding fehlgeschlagen → Status ERROR
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { embeddingStatus: "ERROR" },
      });

      const errMsg =
        embeddingError instanceof Error
          ? embeddingError.message
          : "Embedding-Fehler";
      return Response.json(
        { ...kb, embeddingStatus: "ERROR", error: errMsg },
        { status: 200 } // 200 weil KB erstellt wurde, nur Embedding fehlgeschlagen
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}
