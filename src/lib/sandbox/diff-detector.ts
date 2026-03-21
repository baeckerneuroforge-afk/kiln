/**
 * Diff Detection Engine
 * Erkennt semantische Änderungen auf Websites via Screenshots + Vision.
 * Nicht Pixel-Diff — intelligentes Verständnis von Inhalten.
 */

import { prisma } from "@/lib/prisma";
import { takeScreenshot } from "@/lib/screenshot-service";
import { saveArtifact } from "@/lib/sandbox/artifact-manager";
import { createHash } from "crypto";

/* ── Types ── */

export interface DiffChange {
  changeType: "price_change" | "new_product" | "content_update" | "removed_item" | "layout_change" | "new_promotion" | "other";
  description: string;
  importance: "high" | "medium" | "low";
  details: {
    before?: string;
    after?: string;
  };
}

export interface DiffResult {
  hasChanges: boolean;
  changes: DiffChange[];
  summary: string;
}

export interface SnapshotData {
  id: string;
  agentId: string;
  url: string;
  screenshotUrl: string | null;
  screenshotBase64: string | null;
  htmlContentHash: string;
  htmlContent: string;
  capturedAt: Date;
}

const VISION_MODEL = "claude-sonnet-4-20250514";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_SNAPSHOTS_PER_URL = 30;

/* ── Main Class ── */

export class DiffDetector {
  /**
   * Nimmt einen Snapshot einer URL auf (Screenshot + HTML-Content)
   */
  async captureSnapshot(url: string, agentId: string): Promise<SnapshotData> {
    // Screenshot nehmen
    const screenshotBase64 = await takeScreenshot(url, {
      viewportWidth: 1280,
      viewportHeight: 800,
      fullPage: true,
    });

    // HTML-Content extrahieren via fetch
    let htmlContent = "";
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "KILN-DiffDetector/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        htmlContent = await response.text();
      }
    } catch {
      // HTML-Extraktion ist optional
    }

    const htmlContentHash = createHash("sha256")
      .update(this.extractTextContent(htmlContent))
      .digest("hex");

    // Screenshot in Supabase speichern (falls vorhanden)
    let screenshotUrl: string | null = null;
    if (screenshotBase64) {
      try {
        const artifact = await saveArtifact(
          `diff-${agentId}`,
          `snapshot-${Date.now()}.png`,
          Buffer.from(screenshotBase64, "base64"),
          "image/png",
        );
        screenshotUrl = artifact.storageUrl;
      } catch {
        // Screenshot-Speicherung ist optional
      }
    }

    // In DB speichern
    const record = await prisma.diffSnapshot.create({
      data: {
        agentId,
        url,
        screenshotUrl,
        htmlContentHash,
      },
    });

    // Alte Snapshots aufräumen
    await this.cleanupOldSnapshots(agentId, url);

    return {
      id: record.id,
      agentId,
      url,
      screenshotUrl,
      screenshotBase64,
      htmlContentHash,
      htmlContent,
      capturedAt: record.capturedAt,
    };
  }

  /**
   * Erkennt Änderungen zwischen zwei Snapshots
   */
  async detectChanges(
    current: SnapshotData,
    previous: SnapshotData,
    sensitivity: string = "important_only",
  ): Promise<DiffResult> {
    // Quick check: wenn HTML-Hash identisch, keine Änderungen
    if (current.htmlContentHash === previous.htmlContentHash) {
      return { hasChanges: false, changes: [], summary: "No changes detected." };
    }

    // Step 1: Text-Diff
    const textChanges = this.quickTextDiff(
      this.extractTextContent(current.htmlContent),
      this.extractTextContent(previous.htmlContent),
    );

    // Step 2: Vision-basierte Analyse wenn Screenshots verfügbar
    let visionChanges: DiffChange[] = [];
    if (current.screenshotBase64 && previous.screenshotBase64) {
      visionChanges = await this.analyzeWithVision(
        current.screenshotBase64,
        previous.screenshotBase64,
        current.url,
        current.capturedAt.toISOString(),
        previous.capturedAt.toISOString(),
      );
    } else if (textChanges.length > 0) {
      // Fallback: Text-basierte Analyse via LLM
      visionChanges = await this.analyzeTextChanges(textChanges, current.url);
    }

    // Step 3: Filtern nach Sensitivity
    const filtered = this.filterBySensitivity(visionChanges, sensitivity);

    // Summary generieren
    const summary = filtered.length > 0
      ? `${filtered.length} change(s) detected on ${current.url}: ${filtered.map((c) => c.description).join("; ").slice(0, 300)}`
      : "No significant changes detected.";

    return {
      hasChanges: filtered.length > 0,
      changes: filtered,
      summary,
    };
  }

  /**
   * Registriert eine URL für fortlaufendes Monitoring
   */
  async trackUrl(
    agentId: string,
    url: string,
    schedule: string,
    notifyVia: { slack?: boolean; email?: string } = {},
    sensitivity: string = "important_only",
  ): Promise<string> {
    const tracker = await prisma.diffTracker.upsert({
      where: { agentId_url: { agentId, url } },
      update: { schedule, sensitivity, notifyVia, isActive: true },
      create: { agentId, url, schedule, sensitivity, notifyVia },
    });
    return tracker.id;
  }

  /**
   * Führt einen Monitoring-Check für einen Tracker durch
   */
  async checkTracker(trackerId: string): Promise<DiffResult | null> {
    const tracker = await prisma.diffTracker.findUnique({
      where: { id: trackerId },
    });
    if (!tracker || !tracker.isActive) return null;

    // Aktuellen Snapshot nehmen
    const current = await this.captureSnapshot(tracker.url, tracker.agentId);

    // Vorherigen Snapshot laden
    const previousRecord = await prisma.diffSnapshot.findFirst({
      where: {
        agentId: tracker.agentId,
        url: tracker.url,
        id: { not: current.id },
      },
      orderBy: { capturedAt: "desc" },
    });

    // Tracker-Timestamp aktualisieren
    await prisma.diffTracker.update({
      where: { id: trackerId },
      data: { lastCheckedAt: new Date() },
    });

    if (!previousRecord) {
      return { hasChanges: false, changes: [], summary: "First snapshot captured — no comparison available yet." };
    }

    // Vorherigen Snapshot-Daten rekonstruieren
    const previous: SnapshotData = {
      id: previousRecord.id,
      agentId: previousRecord.agentId,
      url: previousRecord.url,
      screenshotUrl: previousRecord.screenshotUrl,
      screenshotBase64: null, // Nicht verfügbar, wurde nur als URL gespeichert
      htmlContentHash: previousRecord.htmlContentHash,
      htmlContent: "",
      capturedAt: previousRecord.capturedAt,
    };

    const result = await this.detectChanges(current, previous, tracker.sensitivity);

    // Bei Änderungen: DiffChange-Record erstellen
    if (result.hasChanges) {
      const highestImportance = result.changes.reduce(
        (max, c) => {
          const order = { high: 3, medium: 2, low: 1 };
          return order[c.importance] > order[max] ? c.importance : max;
        },
        "low" as "high" | "medium" | "low",
      );

      await prisma.diffChange.create({
        data: {
          diffTrackerId: trackerId,
          snapshotBeforeId: previousRecord.id,
          snapshotAfterId: current.id,
          changes: JSON.parse(JSON.stringify(result.changes)),
          summary: result.summary,
          importance: highestImportance,
        },
      });

      await prisma.diffTracker.update({
        where: { id: trackerId },
        data: { lastChangeDetectedAt: new Date() },
      });
    }

    return result;
  }

  /* ── Private Helpers ── */

  /**
   * Extrahiert reinen Text aus HTML
   */
  private extractTextContent(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000);
  }

  /**
   * Schneller Text-Diff: findet hinzugefügte/entfernte Wörter
   */
  private quickTextDiff(currentText: string, previousText: string): string[] {
    const currentWords = new Set(currentText.split(/\s+/).filter((w) => w.length > 3));
    const previousWords = new Set(previousText.split(/\s+/).filter((w) => w.length > 3));

    const added: string[] = [];
    const removed: string[] = [];

    currentWords.forEach((word) => {
      if (!previousWords.has(word)) added.push(word);
    });
    previousWords.forEach((word) => {
      if (!currentWords.has(word)) removed.push(word);
    });

    const changes: string[] = [];
    if (added.length > 0) changes.push(`Added: ${added.slice(0, 20).join(", ")}`);
    if (removed.length > 0) changes.push(`Removed: ${removed.slice(0, 20).join(", ")}`);
    return changes;
  }

  /**
   * Sendet beide Screenshots an Vision-Modell zur Analyse
   */
  private async analyzeWithVision(
    currentScreenshot: string,
    previousScreenshot: string,
    url: string,
    currentDate: string,
    previousDate: string,
  ): Promise<DiffChange[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          max_tokens: 2048,
          system: "You analyze website screenshots to detect meaningful changes. Return ONLY valid JSON array.",
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: `Compare these two screenshots of ${url}.\nScreenshot 1 (BEFORE) from ${previousDate}.\nScreenshot 2 (AFTER) from ${currentDate}.\n\nIdentify ALL meaningful changes: price changes, new products, new content, removed items, layout changes, new promotions, changed contact info.\n\nReturn JSON array: [{ "changeType": "price_change"|"new_product"|"content_update"|"removed_item"|"layout_change"|"new_promotion"|"other", "description": "...", "importance": "high"|"medium"|"low", "details": { "before": "...", "after": "..." } }]\n\nIf no meaningful changes, return [].`,
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: previousScreenshot.slice(0, 100000) },
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: currentScreenshot.slice(0, 100000) },
              },
            ],
          }],
        }),
      });

      if (!response.ok) return [];

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

      // JSON aus der Antwort extrahieren
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      return JSON.parse(jsonMatch[0]) as DiffChange[];
    } catch {
      return [];
    }
  }

  /**
   * Fallback: Analysiert Text-Änderungen via LLM
   */
  private async analyzeTextChanges(textChanges: string[], url: string): Promise<DiffChange[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          system: "Classify website text changes. Return ONLY valid JSON array.",
          messages: [{
            role: "user",
            content: `Website: ${url}\nText changes detected:\n${textChanges.join("\n")}\n\nClassify each meaningful change as JSON array: [{ "changeType": "price_change"|"new_product"|"content_update"|"removed_item"|"layout_change"|"new_promotion"|"other", "description": "...", "importance": "high"|"medium"|"low", "details": {} }]`,
          }],
        }),
      });

      if (!response.ok) return [];

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      return JSON.parse(jsonMatch[0]) as DiffChange[];
    } catch {
      return [];
    }
  }

  /**
   * Filtert Änderungen nach Sensitivity-Einstellung
   */
  private filterBySensitivity(changes: DiffChange[], sensitivity: string): DiffChange[] {
    switch (sensitivity) {
      case "price_changes_only":
        return changes.filter((c) => c.changeType === "price_change");
      case "important_only":
        return changes.filter((c) => c.importance === "high" || c.importance === "medium");
      case "all_changes":
      default:
        return changes;
    }
  }

  /**
   * Räumt alte Snapshots auf (max 30 pro URL)
   */
  private async cleanupOldSnapshots(agentId: string, url: string): Promise<void> {
    try {
      const count = await prisma.diffSnapshot.count({
        where: { agentId, url },
      });

      if (count > MAX_SNAPSHOTS_PER_URL) {
        const oldSnapshots = await prisma.diffSnapshot.findMany({
          where: { agentId, url },
          orderBy: { capturedAt: "asc" },
          take: count - MAX_SNAPSHOTS_PER_URL,
          select: { id: true },
        });

        if (oldSnapshots.length > 0) {
          await prisma.diffSnapshot.deleteMany({
            where: { id: { in: oldSnapshots.map((s) => s.id) } },
          });
        }
      }
    } catch {
      // Cleanup ist optional
    }
  }
}
