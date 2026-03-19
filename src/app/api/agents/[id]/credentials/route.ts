import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { saveCredential, getCredentials } from "@/lib/computer-use-credentials";

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
      select: { id: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const credentials = await getCredentials(agent.id);
    return Response.json({ credentials });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

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
      select: { id: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json();
    const { serviceName, loginUrl, username, password } = body;

    if (!serviceName || !loginUrl || !username || !password) {
      return Response.json(
        { error: "serviceName, loginUrl, username und password sind erforderlich" },
        { status: 400 }
      );
    }

    const credential = await saveCredential({
      agentId: agent.id,
      serviceName,
      loginUrl,
      username,
      password,
    });

    return Response.json({ credential }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
