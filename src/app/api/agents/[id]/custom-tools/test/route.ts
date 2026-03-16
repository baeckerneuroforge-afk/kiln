import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/url-validation";

// POST: Custom Tool testen — macht den HTTP-Request und gibt die Antwort zurück
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

    const { method, url, headers, body } = await request.json();

    if (!url) {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(headers || {}),
      },
    };

    if (body && method !== "GET") {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await safeFetch(url, fetchOptions);

    const contentType = response.headers.get("content-type") || "";
    let responseData;

    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    return Response.json({
      status: response.status,
      statusText: response.statusText,
      data: responseData,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return Response.json({ error: "Request timed out (10s limit)" }, { status: 408 });
    }
    const message = err instanceof Error ? err.message : "Request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
