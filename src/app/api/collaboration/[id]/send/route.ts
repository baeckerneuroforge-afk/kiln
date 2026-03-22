import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { agentCollaboration } from "@/lib/collaboration/agent-collaboration";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: targetAgentId } = await params;
    const { message, sourceAgentId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await agentCollaboration.sendToAgent(
      sourceAgentId || "",
      targetAgentId,
      userId,
      message
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Collaboration send error:", error);
    return NextResponse.json({ error: "Failed to send message to shared agent" }, { status: 500 });
  }
}
