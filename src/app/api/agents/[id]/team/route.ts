import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const RESEND_API = "https://api.resend.com";
const EMAIL_DOMAIN = "getkiln.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

// GET: List team members for an agent
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const members = await prisma.teamMember.findMany({
      where: { agentId },
      orderBy: { invitedAt: "desc" },
    });

    return Response.json({ members });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Invite a team member
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { email, role } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return Response.json({ error: "Valid email address required" }, { status: 400 });
    }

    const validRole = role === "EDITOR" ? "EDITOR" : "VIEWER";

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Check if already invited
    const existing = await prisma.teamMember.findUnique({
      where: { agentId_email: { agentId, email: email.toLowerCase().trim() } },
    });
    if (existing) {
      return Response.json({ error: "This email is already invited" }, { status: 400 });
    }

    // Create team member
    const member = await prisma.teamMember.create({
      data: {
        agentId,
        email: email.toLowerCase().trim(),
        role: validRole,
      },
    });

    // Send invitation email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const agentUrl = `${APP_URL}/a/${agent.slug}`;
      try {
        await fetch(`${RESEND_API}/emails`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `KILN <noreply@${EMAIL_DOMAIN}>`,
            to: email.toLowerCase().trim(),
            subject: `You've been invited to access ${agent.name} on KILN`,
            text: `Hi,\n\nYou've been invited to access the internal agent "${agent.name}" on KILN.\n\nTo get started, create a free KILN account (if you don't already have one) and visit:\n${agentUrl}\n\nYour role: ${validRole}\n\nBest,\nThe KILN Team`,
          }),
        });
      } catch {
        // Email sending failed — invitation still created
      }
    }

    return Response.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove a team member
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { memberId } = await req.json();

    if (!memberId) return Response.json({ error: "Member ID required" }, { status: 400 });

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    await prisma.teamMember.delete({ where: { id: memberId } });

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
