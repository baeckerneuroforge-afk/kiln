import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kiln-topaz.vercel.app";

// POST: Connect GitHub to agent — register webhook on repo
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const body = await request.json();
    const { githubToken, repoFullName, events } = body;

    if (!githubToken || !repoFullName) {
      return Response.json({ error: "GitHub token and repository name are required" }, { status: 400 });
    }

    // Validate the token by checking repo access
    const repoCheck = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!repoCheck.ok) {
      return Response.json({ error: "Invalid token or no access to repository" }, { status: 400 });
    }

    const webhookUrl = `${APP_URL}/api/webhooks/github/${agentId}`;
    const selectedEvents = events || ["issues", "pull_request"];

    // Create webhook on the GitHub repo
    const webhookRes = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
      method: "POST",
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: selectedEvents,
        config: {
          url: webhookUrl,
          content_type: "json",
          insecure_ssl: "0",
        },
      }),
    });

    if (!webhookRes.ok) {
      const errData = await webhookRes.json().catch(() => ({}));
      const msg = (errData as Record<string, unknown>).message || "Failed to create GitHub webhook";
      return Response.json({ error: msg }, { status: 400 });
    }

    const webhookData = await webhookRes.json() as Record<string, unknown>;

    const configJson = JSON.stringify({
      githubToken,
      repoFullName,
      events: selectedEvents,
      webhookId: webhookData.id,
      webhookUrl,
    });

    // Save channel config
    await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: "GITHUB" } },
      create: {
        agentId,
        type: "GITHUB",
        config: configJson,
        isActive: true,
      },
      update: {
        config: configJson,
        isActive: true,
      },
    });

    return Response.json({
      connected: true,
      repoFullName,
      events: selectedEvents,
      webhookUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET: Check GitHub connection status
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const channel = await prisma.agentChannel.findFirst({
      where: { agentId, type: "GITHUB", agent: { userId } },
    });

    if (!channel) {
      return Response.json({ connected: false });
    }

    const config = JSON.parse(channel.config || "{}") as Record<string, unknown>;
    return Response.json({
      connected: true,
      repoFullName: config.repoFullName,
      events: config.events,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Disconnect GitHub — remove webhook
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const channel = await prisma.agentChannel.findFirst({
      where: { agentId, type: "GITHUB", agent: { userId } },
    });

    if (!channel) return Response.json({ error: "Not connected" }, { status: 404 });

    const config = JSON.parse(channel.config || "{}") as Record<string, unknown>;
    const githubToken = config.githubToken as string;
    const repoFullName = config.repoFullName as string;
    const webhookId = config.webhookId as number;

    // Try to remove webhook from GitHub
    if (githubToken && repoFullName && webhookId) {
      await fetch(`https://api.github.com/repos/${repoFullName}/hooks/${webhookId}`, {
        method: "DELETE",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }).catch(() => {});
    }

    await prisma.agentChannel.delete({ where: { id: channel.id } });
    return Response.json({ disconnected: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
