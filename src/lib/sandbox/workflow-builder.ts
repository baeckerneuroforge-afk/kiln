/**
 * Agent Builds Agents — Workflow Builder Service
 * Erstellt vollständige KILN Workflows programmatisch aus natürlicher Sprache.
 * Geht über den existierenden Wizard hinaus: erstellt echte Workflows in der DB.
 */

import { prisma } from "@/lib/prisma";
import { getCreditCost } from "@/lib/credits";

/* ── Types ── */

export interface WorkflowBlueprint {
  name: string;
  description: string;
  goal: string;
  trigger: {
    type: "manual" | "schedule" | "webhook";
    config: Record<string, unknown>;
  };
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  estimatedCreditsPerRun: number;
  reasoning: string;
}

export interface BlueprintNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface BlueprintEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface BuildResult {
  teamId: string;
  blueprint: WorkflowBlueprint;
  status: "draft" | "active";
  previewUrl: string;
  credentialsNeeded: string[];
}

/* ── Available Node Types (für LLM-Prompt) ── */

const NODE_TYPE_DESCRIPTIONS = `
Verfügbare Node-Typen:
- trigger_manual: Manueller Start (kein Config nötig)
- trigger_schedule: Zeitplan-Trigger (config: { cron: "0 9 * * 1" })
- trigger_webhook: Webhook-Trigger (config: { path: "/my-hook" })
- computer_use: Browser-Agent — navigiert, klickt, extrahiert Daten von Websites (config: { task, startUrl, maxSteps, captureScreenshots, enableVerification, enableProceduralMemory })
- code_sandbox: Code-Ausführung in isolierter Sandbox (config: { language: "python"|"javascript", goal, packages[] })
- ai_agent: AI Chat-Agent für Textverarbeitung (config: { systemPrompt, model })
- gmail_send: E-Mail senden (config: { to, subject, body })
- slack_send_integration: Slack-Nachricht senden (config: { channel, message })
- http_request: HTTP-Request (config: { method, url, headers, body })
- condition: Bedingungslogik (config: { expression, trueLabel, falseLabel })
- merge: Mehrere Inputs zusammenführen (config: { strategy: "concat"|"compare"|"summarize" })
- transform: Daten transformieren (config: { template, outputFormat })
- delay: Warten (config: { delayMs })
`;

const BUILDER_MODEL = "claude-sonnet-4-20250514";

/* ── WorkflowBuilder ── */

/**
 * Hauptmethode: Erstellt einen Workflow aus natürlicher Sprache.
 */
export async function buildWorkflow(
  description: string,
  userId: string,
  agentId?: string,
): Promise<BuildResult> {
  // Step 1: Blueprint generieren via LLM
  const blueprint = await generateBlueprint(description);

  // Step 2: Blueprint validieren
  validateBlueprint(blueprint);

  // Step 3: Credentials prüfen
  const credentialsNeeded = detectCredentialsNeeded(blueprint);

  // Step 4: Workflow in DB erstellen
  const teamId = await createWorkflowInDb(blueprint, userId);

  // Step 5: Wenn ein Agent angegeben ist, als Team-Mitglied hinzufügen
  if (agentId) {
    await linkAgentToWorkflow(teamId, agentId);
  }

  return {
    teamId,
    blueprint,
    status: "draft",
    previewUrl: `/dashboard/teams/${teamId}`,
    credentialsNeeded,
  };
}

/**
 * Generiert einen Workflow-Blueprint aus einer natürlichsprachlichen Beschreibung.
 */
async function generateBlueprint(description: string): Promise<WorkflowBlueprint> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: BUILDER_MODEL,
      max_tokens: 3000,
      system: `Du bist ein Workflow-Architekt für KILN, eine AI Agent Platform.
Der User beschreibt einen wiederkehrenden Task. Du entwirfst einen kompletten Workflow.

${NODE_TYPE_DESCRIPTIONS}

Regeln:
1. Jeder Workflow beginnt mit GENAU einem Trigger-Node
2. IDs: trigger_1, node_1, node_2, ...
3. Edges verbinden Nodes: source → target
4. Positionen: Trigger links (x=100), dann nach rechts (spacing 300px)
5. Bei parallelen Branches: Y-Offset (150px pro Branch)
6. Maximal 10 Nodes
7. Sei SPEZIFISCH mit Configs: echte URLs, sinnvolle Prompts, konkrete Schedules
8. Bei Computer Use: immer startUrl angeben wenn möglich

Antworte NUR als JSON:
{
  "name": "Workflow-Name",
  "description": "Was dieser Workflow tut",
  "goal": "Das Ziel in einem Satz",
  "trigger": { "type": "schedule|manual|webhook", "config": { ... } },
  "nodes": [{ "id": "node_1", "type": "computer_use", "label": "...", "config": { ... }, "position": { "x": 400, "y": 200 } }],
  "edges": [{ "id": "edge_1", "source": "trigger_1", "target": "node_1" }],
  "reasoning": "Warum dieser Aufbau"
}`,
      messages: [
        { role: "user", content: description },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    throw new Error(`LLM-Fehler: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Kein gültiger Workflow generiert");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  // Blueprint zusammensetzen
  const triggerObj = parsed.trigger as { type?: string; config?: Record<string, unknown> } | undefined;
  const triggerNode: BlueprintNode = {
    id: "trigger_1",
    type: `trigger_${triggerObj?.type || "manual"}`,
    label: triggerObj?.type === "schedule" ? "Zeitplan" : triggerObj?.type === "webhook" ? "Webhook" : "Manuell",
    config: triggerObj?.config || {},
    position: { x: 100, y: 200 },
  };

  const rawNodes = (parsed.nodes || []) as BlueprintNode[];
  const rawEdges = (parsed.edges || []) as BlueprintEdge[];

  const allNodes = [triggerNode, ...rawNodes];
  const estimatedCredits = estimateCreditsFromBlueprint(allNodes);

  return {
    name: String(parsed.name || "Neuer Workflow"),
    description: String(parsed.description || ""),
    goal: String(parsed.goal || ""),
    trigger: {
      type: (triggerObj?.type as "manual" | "schedule" | "webhook") || "manual",
      config: triggerObj?.config || {},
    },
    nodes: allNodes,
    edges: rawEdges,
    estimatedCreditsPerRun: estimatedCredits,
    reasoning: String(parsed.reasoning || ""),
  };
}

/**
 * Validiert einen Blueprint auf Vollständigkeit.
 */
function validateBlueprint(blueprint: WorkflowBlueprint): void {
  if (blueprint.nodes.length === 0) {
    throw new Error("Workflow hat keine Nodes");
  }

  // Prüfe ob alle Edge-Referenzen gültig sind
  const nodeIds = new Set(blueprint.nodes.map((n) => n.id));
  for (const edge of blueprint.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`Edge referenziert unbekannten Source-Node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`Edge referenziert unbekannten Target-Node: ${edge.target}`);
    }
  }

  // Prüfe ob mindestens ein Trigger vorhanden
  const hasTrigger = blueprint.nodes.some((n) => n.type.startsWith("trigger_"));
  if (!hasTrigger) {
    throw new Error("Workflow benötigt mindestens einen Trigger-Node");
  }
}

/**
 * Erkennt welche Credentials für den Workflow benötigt werden.
 */
function detectCredentialsNeeded(blueprint: WorkflowBlueprint): string[] {
  const needed: string[] = [];

  for (const node of blueprint.nodes) {
    if (node.type === "gmail_send") needed.push("Gmail OAuth");
    if (node.type === "slack_send_integration") needed.push("Slack OAuth");
    if (node.type === "computer_use") {
      const url = String(node.config.startUrl || "");
      if (url && (url.includes("login") || url.includes("dashboard") || url.includes("account"))) {
        needed.push(`Login-Credentials für ${new URL(url).hostname}`);
      }
    }
  }

  return [...new Set(needed)];
}

/**
 * Schätzt die Credits pro Durchlauf basierend auf den Nodes.
 */
function estimateCreditsFromBlueprint(nodes: BlueprintNode[]): number {
  let credits = 0;

  for (const node of nodes) {
    switch (node.type) {
      case "computer_use": {
        const maxSteps = Number(node.config.maxSteps || 10);
        const model = "claude-sonnet-4-20250514";
        credits += maxSteps * getCreditCost(model); // Jeder Schritt = 1 LLM-Call
        if (node.config.enableVerification) {
          credits += maxSteps * getCreditCost("claude-haiku-4-5-20251001"); // Verification
        }
        break;
      }
      case "code_sandbox":
        credits += 3 * getCreditCost("claude-sonnet-4-20250514"); // ~3 Iterationen
        break;
      case "ai_agent":
        credits += getCreditCost(String(node.config.model || "claude-sonnet-4-20250514"));
        break;
      case "http_request":
      case "gmail_send":
      case "slack_send_integration":
        // Kein LLM-Aufruf
        break;
      default:
        break;
    }
  }

  return credits;
}

/**
 * Erstellt den Workflow als AgentTeam in der Datenbank.
 */
async function createWorkflowInDb(blueprint: WorkflowBlueprint, userId: string): Promise<string> {
  // Upsert User
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: `${userId}@clerk.dev` },
    update: {},
  });

  const team = await prisma.agentTeam.create({
    data: {
      userId,
      name: blueprint.name,
      description: blueprint.description,
      goal: blueprint.goal,
      status: "PAUSED",
      config: JSON.parse(JSON.stringify({
        nodes: blueprint.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          data: { label: n.label, config: n.config },
          position: n.position,
        })),
        edges: blueprint.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        })),
        variables: {},
        autoBuilt: true,
        estimatedCreditsPerRun: blueprint.estimatedCreditsPerRun,
        reasoning: blueprint.reasoning,
      })),
    },
  });

  return team.id;
}

/**
 * Verknüpft einen existierenden Agent mit dem Workflow.
 */
async function linkAgentToWorkflow(teamId: string, agentId: string): Promise<void> {
  try {
    await prisma.agentTeamMember.create({
      data: {
        teamId,
        agentId,
        role: "EXECUTOR",
        level: 2,
        config: {},
      },
    });
  } catch {
    // Agent evtl. schon verknüpft
  }
}

/**
 * Aktiviert einen Draft-Workflow.
 */
export async function activateWorkflow(teamId: string, userId: string): Promise<void> {
  const team = await prisma.agentTeam.findFirst({
    where: { id: teamId, userId },
  });

  if (!team) throw new Error("Workflow nicht gefunden");

  await prisma.agentTeam.update({
    where: { id: teamId },
    data: { status: "ACTIVE" },
  });
}

/**
 * Dekomponiert eine komplexe Beschreibung in Teilaufgaben.
 * Nützlich für Follow-up-Fragen im Chat.
 */
export async function analyzeAndDecompose(description: string): Promise<{
  components: string[];
  questions: string[];
  needsMoreInfo: boolean;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { components: [description], questions: [], needsMoreInfo: false };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: `Analysiere die Workflow-Beschreibung. Antworte als JSON:
{
  "components": ["Teilaufgabe 1", "Teilaufgabe 2"],
  "questions": ["Frage 1 an den User", "Frage 2"],
  "needsMoreInfo": true/false
}
Stelle Fragen wenn: URLs fehlen, Zeitplan unklar, Output-Ziel unklar, Credentials nötig.`,
        messages: [
          { role: "user", content: description },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { components: [description], questions: [], needsMoreInfo: false };
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { components: [description], questions: [], needsMoreInfo: false };

    return JSON.parse(jsonMatch[0]);
  } catch {
    return { components: [description], questions: [], needsMoreInfo: false };
  }
}
