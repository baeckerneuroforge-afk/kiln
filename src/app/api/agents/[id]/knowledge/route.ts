import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchUrlContent } from "@/lib/rag";

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

/**
 * Trigger the embed endpoint as a separate Vercel function invocation.
 * Awaited with a 5s send-timeout so the request is guaranteed to leave
 * before the POST handler returns its 202.
 */
async function triggerEmbedding(agentId: string, kbId: string, userId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000";
  const url = `${baseUrl}/api/agents/${agentId}/knowledge/${kbId}/embed`;
  const cronSecret = process.env.CRON_SECRET;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret && { Authorization: `Bearer ${cronSecret}` }),
      },
      body: JSON.stringify({ userId }),
      // 5s to SEND the request — we don't wait for completion
      signal: AbortSignal.timeout(5000),
    });
    console.warn(`[KB] triggerEmbedding ${kbId}: ${res.status}`);
  } catch (err) {
    // AbortError is expected (we abort after 5s, the embed endpoint runs for 50s)
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout")) {
      console.warn(`[KB] triggerEmbedding ${kbId}: request sent (aborted after 5s — expected)`);
    } else {
      console.error(`[KB] triggerEmbedding ${kbId} failed:`, msg);
    }
  }
}

// Create new knowledge base entry + trigger async embedding
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
        console.warn(`[KB] URL import: fetching ${body.url}`);
        textContent = await fetchUrlContent(body.url);
        console.warn(`[KB] URL import: fetched ${textContent.length} chars`);
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

    // Create KB entry with PROCESSING status — save content for the embed endpoint to read
    const kb = await prisma.knowledgeBase.create({
      data: {
        agentId: params.id,
        type,
        sourceName,
        content: textContent.slice(0, 50000),
        embeddingStatus: "PROCESSING",
      },
    });

    // Trigger embedding as separate function — await to ensure request leaves
    await triggerEmbedding(params.id, kb.id, userId);

    // Return immediately with 202
    console.warn(`[KB] Created ${kb.id}, returning 202`);
    return Response.json(
      { ...kb, status: "processing", id: kb.id },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.warn(`[KB] POST error:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
