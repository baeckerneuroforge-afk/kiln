import { auth } from "@clerk/nextjs/server";
import { listUserTasks } from "@/lib/quick-use/background-executor";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tasks = await listUserTasks(userId, 20);
  return Response.json({ tasks });
}
