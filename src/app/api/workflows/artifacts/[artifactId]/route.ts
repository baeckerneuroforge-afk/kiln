import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { downloadArtifact, getArtifact } from "@/lib/sandbox/artifact-manager";

/**
 * GET /api/workflows/artifacts/[artifactId] — Artifact herunterladen
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;

  // Metadata abrufen
  const artifact = getArtifact(artifactId);
  if (!artifact) {
    return Response.json({ error: "Artifact nicht gefunden" }, { status: 404 });
  }

  // Datei herunterladen
  const file = await downloadArtifact(artifactId);
  if (!file) {
    return Response.json({ error: "Artifact abgelaufen oder nicht verfügbar" }, { status: 410 });
  }

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.buffer.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
