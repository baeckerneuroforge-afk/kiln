import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { getTaskDetail } from "@/lib/quick-use/background-executor";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const task = await getTaskDetail(taskId, userId);

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task });
}
