import { auth } from "@clerk/nextjs/server";
import { getQueueStatus } from "@/lib/execution-queue";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getQueueStatus(params.id);
    return Response.json(status);
  } catch (err) {
    console.error("Queue status error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to get queue status" },
      { status: 500 }
    );
  }
}
