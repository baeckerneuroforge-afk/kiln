import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { quickUseSessionMemory } from "@/lib/quick-use/session-memory";
import type { QuickUseType } from "@/lib/quick-use/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    message?: string;
    type?: QuickUseType;
    limit?: number;
  } | null;

  const message = body?.message?.trim();
  if (!message || message.length < 3) {
    return NextResponse.json({ memories: [] });
  }

  const memories = await quickUseSessionMemory.getRelevantMemory(userId, message, {
    limit: Math.min(Math.max(Number(body?.limit) || 3, 1), 3),
    quickUseType: body?.type,
  });

  return NextResponse.json({
    memories: memories.map((memory) => quickUseSessionMemory.toPreview(memory)),
  });
}
