/**
 * Artifact Manager
 * Verwaltet Dateien die durch Code-Ausführung erstellt werden.
 * Speichert Artifacts in Supabase Storage (Bucket: "agent-artifacts").
 */

import { getSupabaseAdmin } from "@/lib/supabase";

const ARTIFACT_BUCKET = "agent-artifacts";
const ARTIFACT_TTL_DAYS = 7;

/* ── Types ── */

export interface Artifact {
  id: string;
  sessionId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  storageUrl: string;
  createdAt: string;
  expiresAt: string;
}

// In-memory Artifact-Registry (ergänzt durch Supabase Storage)
const artifactRegistry = new Map<string, Artifact>();

/**
 * Speichert ein Artifact in Supabase Storage.
 */
export async function saveArtifact(
  sessionId: string,
  filePath: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<Artifact> {
  const id = `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fileName = filePath.split("/").pop() || `file_${id}`;
  const storagePath = `${sessionId}/${id}_${fileName}`;

  const supabase = getSupabaseAdmin();

  // Upload zu Supabase Storage
  const { error } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Artifact-Upload fehlgeschlagen: ${error.message}`);
  }

  // Öffentliche URL generieren
  const { data: urlData } = supabase.storage
    .from(ARTIFACT_BUCKET)
    .getPublicUrl(storagePath);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ARTIFACT_TTL_DAYS * 24 * 60 * 60 * 1000);

  const artifact: Artifact = {
    id,
    sessionId,
    fileName,
    filePath: storagePath,
    mimeType,
    size: fileBuffer.length,
    storageUrl: urlData.publicUrl,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  artifactRegistry.set(id, artifact);

  return artifact;
}

/**
 * Holt alle Artifacts einer Session.
 */
export function getArtifacts(sessionId: string): Artifact[] {
  return Array.from(artifactRegistry.values())
    .filter((a) => a.sessionId === sessionId);
}

/**
 * Holt ein einzelnes Artifact.
 */
export function getArtifact(artifactId: string): Artifact | null {
  return artifactRegistry.get(artifactId) || null;
}

/**
 * Lädt den Inhalt eines Artifacts herunter.
 */
export async function downloadArtifact(artifactId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileName: string;
} | null> {
  const artifact = artifactRegistry.get(artifactId);
  if (!artifact) return null;

  // Prüfe ob abgelaufen
  if (new Date(artifact.expiresAt) < new Date()) {
    artifactRegistry.delete(artifactId);
    return null;
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .download(artifact.filePath);

  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());

  return {
    buffer,
    mimeType: artifact.mimeType,
    fileName: artifact.fileName,
  };
}

/**
 * Löscht abgelaufene Artifacts.
 * Wird periodisch aufgerufen (z.B. via Cron).
 */
export async function cleanupExpiredArtifacts(): Promise<number> {
  const now = new Date();
  const expired: string[] = [];

  for (const [id, artifact] of artifactRegistry.entries()) {
    if (new Date(artifact.expiresAt) < now) {
      expired.push(id);
    }
  }

  if (expired.length === 0) return 0;

  const supabase = getSupabaseAdmin();
  const paths = expired
    .map((id) => artifactRegistry.get(id)?.filePath)
    .filter((p): p is string => !!p);

  if (paths.length > 0) {
    await supabase.storage.from(ARTIFACT_BUCKET).remove(paths);
  }

  for (const id of expired) {
    artifactRegistry.delete(id);
  }

  return expired.length;
}
