/**
 * Proof of Work Report API
 * GET: Report-Metadaten + Download-URL
 * POST: Manuell Report generieren
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ProofOfWorkGenerator } from "@/lib/sandbox/proof-of-work-generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { executionId } = await params;

  try {
    // Prüfe ob bereits ein Report existiert (über Artifact-System)
    const { getArtifacts } = await import("@/lib/sandbox/artifact-manager");
    const artifacts = getArtifacts(executionId);
    const report = artifacts.find((a) => a.mimeType === "application/pdf" && a.fileName.includes("proof-of-work"));

    if (!report) {
      return NextResponse.json({ exists: false, message: "No report generated yet" });
    }

    return NextResponse.json({
      exists: true,
      reportId: report.id,
      reportUrl: report.storageUrl,
      fileName: report.fileName,
      generatedAt: report.createdAt,
      expiresAt: report.expiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch report" },
      { status: 500 },
    );
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { executionId } = await params;

  try {
    const generator = new ProofOfWorkGenerator();
    const report = await generator.generateReport(executionId);

    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Report generation failed" },
      { status: 500 },
    );
  }
}
