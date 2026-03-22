import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { agentCollaboration } from "@/lib/collaboration/agent-collaboration";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const result = await agentCollaboration.acceptCollaboration(id, userId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Collaboration accept error:", error);
    return NextResponse.json({ error: "Failed to accept collaboration" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const result = await agentCollaboration.revokeCollaboration(id, userId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Collaboration revoke error:", error);
    return NextResponse.json({ error: "Failed to revoke collaboration" }, { status: 500 });
  }
}
