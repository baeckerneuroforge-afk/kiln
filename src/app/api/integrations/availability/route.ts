import { auth } from "@clerk/nextjs/server";
import { getAvailableIntegrations } from "@/lib/integration-availability";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const availability = getAvailableIntegrations();
  return Response.json({ availability });
}
