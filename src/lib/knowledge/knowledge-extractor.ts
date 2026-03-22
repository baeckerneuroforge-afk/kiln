import { knowledgeGraph, EntityType } from "./knowledge-graph";
import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const EXTRACTION_SYSTEM_PROMPT = `Extract all companies, people, products, prices, websites, and their relationships from this data. Return JSON: { entities: [{type, name, properties: {}}], relations: [{from: string, to: string, type: string, properties?: {}}] }

Valid entity types: Company, Person, Product, Website, Price, Event, Document, Insight
Valid relation types: has_product, employs, competes_with, changed_price, mentioned_in, located_at, sells, owns, provides, references, related_to

Rules:
- "from" and "to" in relations must match entity names exactly
- Properties should contain relevant details (URL, price value, description, etc.)
- Return ONLY valid JSON, no markdown or explanation
- If no entities found, return { "entities": [], "relations": [] }`;

interface ExtractedEntity {
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
}

interface ExtractedRelation {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, unknown>;
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

type ResultType =
  | "computer_use"
  | "diff_detection"
  | "deep_research"
  | "multi_site"
  | "task_run";

/**
 * KnowledgeExtractor — extrahiert Entitäten und Relationen aus
 * Agent-Ergebnissen mittels Claude Haiku und speichert sie im Knowledge Graph.
 *
 * Fehler bei der Extraktion brechen NIEMALS den Hauptfluss.
 */
class KnowledgeExtractor {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  /**
   * Haupt-Einstiegspunkt: Entitäten aus einem Agent-Ergebnis extrahieren.
   */
  async extract(
    userId: string,
    agentId: string,
    executionId: string,
    resultData: unknown,
    resultType: ResultType
  ) {
    try {
      const dataString =
        typeof resultData === "string"
          ? resultData
          : JSON.stringify(resultData, null, 2);

      // Daten auf sinnvolle Größe begrenzen
      const truncatedData = dataString.slice(0, 15000);

      const response = await this.anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 2048,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Result type: ${resultType}\n\nData:\n${truncatedData}`,
          },
        ],
      });

      // Response parsen
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return;

      let parsed: ExtractionResult;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        // Versuch, JSON aus Markdown-Block zu extrahieren
        const jsonMatch = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          console.warn(
            "[KnowledgeExtractor] Konnte LLM-Antwort nicht als JSON parsen"
          );
          return;
        }
      }

      if (!parsed.entities || !Array.isArray(parsed.entities)) return;

      // Entitäten im Graph speichern
      const entityMap = new Map<string, string>(); // name -> entityId

      for (const entity of parsed.entities) {
        try {
          const saved = await knowledgeGraph.addEntity(userId, {
            type: entity.type,
            name: entity.name,
            properties: entity.properties || {},
            source: {
              agentId,
              executionId,
              timestamp: new Date(),
            },
          });
          entityMap.set(entity.name, saved.id);
        } catch (err) {
          console.warn(
            `[KnowledgeExtractor] Fehler beim Speichern der Entität "${entity.name}":`,
            err
          );
        }
      }

      // Relationen speichern
      if (parsed.relations && Array.isArray(parsed.relations)) {
        for (const relation of parsed.relations) {
          try {
            const fromId = entityMap.get(relation.from);
            const toId = entityMap.get(relation.to);

            if (fromId && toId) {
              await knowledgeGraph.addRelation(
                userId,
                fromId,
                toId,
                relation.type,
                relation.properties,
                agentId,
                executionId
              );
            }
          } catch (err) {
            console.warn(
              `[KnowledgeExtractor] Fehler beim Speichern der Relation "${relation.from}" -> "${relation.to}":`,
              err
            );
          }
        }
      }
    } catch (err) {
      // Knowledge-Extraktion darf NIEMALS den Hauptfluss unterbrechen
      console.error("[KnowledgeExtractor] Extraktion fehlgeschlagen:", err);
    }
  }

  /**
   * Extraktion aus Computer-Use-Ergebnissen.
   * URLs werden als Website-Entitäten, Preise als Price-Entitäten,
   * Kontakte als Person-Entitäten extrahiert.
   */
  async extractFromComputerUse(
    userId: string,
    agentId: string,
    executionId: string,
    session: {
      summary?: string;
      extractedData?: unknown;
      urls?: string[];
    }
  ) {
    try {
      // URLs direkt als Website-Entitäten speichern
      if (session.urls && session.urls.length > 0) {
        for (const url of session.urls) {
          try {
            await knowledgeGraph.addEntity(userId, {
              type: "Website",
              name: new URL(url).hostname,
              properties: { url, fullUrl: url },
              source: { agentId, executionId, timestamp: new Date() },
            });
          } catch {
            // Ungültige URL ignorieren
          }
        }
      }

      // Zusammenfassung und extrahierte Daten für LLM-Extraktion
      const combinedData = {
        summary: session.summary,
        extractedData: session.extractedData,
        urls: session.urls,
      };

      await this.extract(userId, agentId, executionId, combinedData, "computer_use");
    } catch (err) {
      console.error(
        "[KnowledgeExtractor] Computer-Use-Extraktion fehlgeschlagen:",
        err
      );
    }
  }

  /**
   * Extraktion aus Diff-Detection-Ergebnissen.
   * Bei Preisänderungen werden spezielle "price_changed" Events erstellt.
   */
  async extractFromDiffDetection(
    userId: string,
    agentId: string,
    executionId: string,
    diffResults: {
      changes?: Array<{
        type?: string;
        summary?: string;
        oldValue?: unknown;
        newValue?: unknown;
        url?: string;
      }>;
      summary?: string;
    }
  ) {
    try {
      // Preisänderungen als spezielle Events verarbeiten
      if (diffResults.changes) {
        for (const change of diffResults.changes) {
          if (
            change.type === "price" ||
            change.summary?.toLowerCase().includes("price") ||
            change.summary?.toLowerCase().includes("preis")
          ) {
            try {
              // Preis-Entität erstellen/updaten
              const priceName = change.url
                ? `Preis: ${new URL(change.url).hostname}`
                : `Preisänderung ${new Date().toISOString()}`;

              const entity = await knowledgeGraph.addEntity(userId, {
                type: "Price",
                name: priceName,
                properties: {
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                  url: change.url,
                  changedAt: new Date().toISOString(),
                },
                source: { agentId, executionId, timestamp: new Date() },
              });

              // Spezielles price_changed Event
              const { prisma: db } = await import("@/lib/prisma");
              await db.knowledgeEvent.create({
                data: {
                  entityId: entity.id,
                  eventType: "price_changed",
                  previousValue: (change.oldValue ?? undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
                  newValue: (change.newValue ?? undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
                  sourceAgentId: agentId,
                  sourceExecutionId: executionId,
                },
              });
            } catch (err) {
              console.warn(
                "[KnowledgeExtractor] Preisänderungs-Event fehlgeschlagen:",
                err
              );
            }
          }
        }
      }

      // Gesamtes Diff-Ergebnis durch LLM extrahieren lassen
      const combinedData = {
        summary: diffResults.summary,
        changes: diffResults.changes,
      };

      await this.extract(userId, agentId, executionId, combinedData, "diff_detection");
    } catch (err) {
      console.error(
        "[KnowledgeExtractor] Diff-Detection-Extraktion fehlgeschlagen:",
        err
      );
    }
  }

  /**
   * Extraktion aus Deep-Research-Ergebnissen.
   * Zusammenfassung und Quellen werden an die generische Extraktion übergeben.
   */
  async extractFromDeepResearch(
    userId: string,
    agentId: string,
    executionId: string,
    research: {
      summary?: string;
      sources?: Array<{ url?: string; title?: string; content?: string }>;
      findings?: unknown;
    }
  ) {
    try {
      const combinedData = {
        summary: research.summary,
        sources: research.sources,
        findings: research.findings,
      };

      await this.extract(userId, agentId, executionId, combinedData, "deep_research");
    } catch (err) {
      console.error(
        "[KnowledgeExtractor] Deep-Research-Extraktion fehlgeschlagen:",
        err
      );
    }
  }
}

export const knowledgeExtractor = new KnowledgeExtractor();
