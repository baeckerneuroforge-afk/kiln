/**
 * Agent Workspace
 * Persistenter Dateispeicher pro Agent.
 * Nutzt Supabase Storage mit Versionierung.
 */

import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getPlanLimits, type PlanType } from "@/lib/stripe";

/* ── Types ── */

export interface WorkspaceFile {
  id: string;
  agentId: string;
  path: string;
  mimeType: string;
  version: number;
  sizeBytes: number;
  storageUrl: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceFileListItem {
  path: string;
  mimeType: string;
  sizeBytes: number;
  latestVersion: number;
  updatedAt: Date;
}

/* ── Constants ── */

const BUCKET = "agent-workspaces";
const MAX_VERSIONS = 5;

/* ── Plan Limits (MB) ── */

const WORKSPACE_LIMITS_MB: Record<string, number> = {
  FREE: 0,
  STARTER: 0,
  PRO: 1024,
  AGENCY: 10240,
  ENTERPRISE: 999999,
};

/* ── Supabase Client ── */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key);
}

/* ── Agent Workspace ── */

export class AgentWorkspace {
  /**
   * Speichert eine Datei im Workspace eines Agents.
   * Erstellt automatisch eine neue Version wenn die Datei existiert.
   */
  async saveFile(
    agentId: string,
    userId: string,
    path: string,
    content: Buffer,
    mimeType: string
  ): Promise<WorkspaceFile> {
    // Plan-Check
    await this.checkStorageLimit(userId, agentId, content.length);

    // Bestehende Datei prüfen (höchste Version)
    const existing = await prisma.agentWorkspaceFile.findFirst({
      where: { agentId, path, isDeleted: false },
      orderBy: { version: "desc" },
    });

    const newVersion = existing ? existing.version + 1 : 1;
    const storagePath = `${userId}/${agentId}/${path}_v${newVersion}`;

    // Upload zu Supabase Storage
    const supabase = getSupabase();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, content, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Datei-Upload fehlgeschlagen: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    // DB-Eintrag erstellen
    const file = await prisma.agentWorkspaceFile.create({
      data: {
        agentId,
        userId,
        path,
        mimeType,
        version: newVersion,
        previousVersionId: existing?.id || null,
        storageUrl: urlData.publicUrl,
        sizeBytes: content.length,
      },
    });

    // Alte Versionen aufräumen (behalte nur MAX_VERSIONS)
    await this.cleanupOldVersions(agentId, path);

    return file as WorkspaceFile;
  }

  /**
   * Lädt die neueste Version einer Datei.
   */
  async getFile(
    agentId: string,
    path: string
  ): Promise<{ file: WorkspaceFile; content: Buffer } | null> {
    const file = await prisma.agentWorkspaceFile.findFirst({
      where: { agentId, path, isDeleted: false },
      orderBy: { version: "desc" },
    });

    if (!file) return null;

    const supabase = getSupabase();
    const storagePath = this.extractStoragePath(file.storageUrl);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(storagePath);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    return { file: file as WorkspaceFile, content: buffer };
  }

  /**
   * Lädt eine bestimmte Version einer Datei.
   */
  async getFileVersion(
    agentId: string,
    path: string,
    version: number
  ): Promise<{ file: WorkspaceFile; content: Buffer } | null> {
    const file = await prisma.agentWorkspaceFile.findFirst({
      where: { agentId, path, version, isDeleted: false },
    });

    if (!file) return null;

    const supabase = getSupabase();
    const storagePath = this.extractStoragePath(file.storageUrl);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(storagePath);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    return { file: file as WorkspaceFile, content: buffer };
  }

  /**
   * Listet alle Dateien im Workspace eines Agents.
   */
  async listFiles(
    agentId: string,
    directory?: string
  ): Promise<WorkspaceFileListItem[]> {
    const where: Record<string, unknown> = {
      agentId,
      isDeleted: false,
    };

    if (directory) {
      where.path = { startsWith: directory };
    }

    // Neueste Version pro Pfad
    const files = await prisma.agentWorkspaceFile.findMany({
      where,
      orderBy: [{ path: "asc" }, { version: "desc" }],
    });

    // Dedupliziere: nur höchste Version pro Pfad
    const seen = new Set<string>();
    const result: WorkspaceFileListItem[] = [];

    for (const file of files) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      result.push({
        path: file.path,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        latestVersion: file.version,
        updatedAt: file.updatedAt,
      });
    }

    return result;
  }

  /**
   * Soft-Delete einer Datei (30 Tage aufbewahrt).
   */
  async deleteFile(agentId: string, path: string): Promise<void> {
    await prisma.agentWorkspaceFile.updateMany({
      where: { agentId, path },
      data: { isDeleted: true },
    });
  }

  /**
   * Gibt die Gesamtgröße des Workspaces zurück (in Bytes).
   */
  async getWorkspaceSize(agentId: string): Promise<number> {
    const result = await prisma.agentWorkspaceFile.aggregate({
      where: { agentId, isDeleted: false },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes || 0;
  }

  /**
   * Gibt das Workspace-Limit für einen Plan zurück (in Bytes).
   */
  getWorkspaceLimitBytes(plan: string): number {
    const mb = WORKSPACE_LIMITS_MB[plan] || 0;
    return mb * 1024 * 1024;
  }

  /* ── Private Helpers ── */

  private async checkStorageLimit(
    userId: string,
    agentId: string,
    newFileSize: number
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const plan = (user?.plan || "FREE") as PlanType;
    const limits = getPlanLimits(plan);

    // Workspace ist nur für Pro+ verfügbar
    if (!limits.codeSandbox) {
      throw new Error("Agent Workspace ist ab dem Pro-Plan verfügbar");
    }

    const limitBytes = this.getWorkspaceLimitBytes(plan);
    const currentSize = await this.getWorkspaceSize(agentId);

    if (currentSize + newFileSize > limitBytes) {
      const limitMB = WORKSPACE_LIMITS_MB[plan] || 0;
      const usedMB = Math.round(currentSize / 1024 / 1024);
      throw new Error(
        `Workspace-Limit erreicht: ${usedMB}MB / ${limitMB}MB verwendet`
      );
    }
  }

  private async cleanupOldVersions(
    agentId: string,
    path: string
  ): Promise<void> {
    const versions = await prisma.agentWorkspaceFile.findMany({
      where: { agentId, path, isDeleted: false },
      orderBy: { version: "desc" },
    });

    if (versions.length <= MAX_VERSIONS) return;

    const toDelete = versions.slice(MAX_VERSIONS);
    const supabase = getSupabase();

    for (const file of toDelete) {
      const storagePath = this.extractStoragePath(file.storageUrl);
      await supabase.storage.from(BUCKET).remove([storagePath]);
      await prisma.agentWorkspaceFile.delete({ where: { id: file.id } });
    }
  }

  private extractStoragePath(storageUrl: string): string {
    // URL format: .../storage/v1/object/public/agent-workspaces/userId/agentId/file_v1
    const parts = storageUrl.split(`/${BUCKET}/`);
    return parts[1] || storageUrl;
  }
}
