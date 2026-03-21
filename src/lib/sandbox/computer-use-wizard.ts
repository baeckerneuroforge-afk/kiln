/**
 * Natural Language Computer Use Setup
 * Konvertiert natürliche Sprache in konfigurierte Computer Use Workflows.
 */

export interface WizardInput {
  description: string;
  teamId?: string;
}

export interface WizardOutput {
  task: string;
  urls: string[];
  schedule?: string;
  extractFields: string[];
  outputFormat: "json" | "csv" | "text";
  notifyVia?: "email" | "slack" | "webhook" | null;
  enableCodeExecution: boolean;
  enableVerification: boolean;
  enableProceduralMemory: boolean;
  suggestedNodes: SuggestedNode[];
  reasoning: string;
}

export interface SuggestedNode {
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

const WIZARD_MODEL = "claude-haiku-4-5-20251001";

/**
 * Analysiert eine natürliche Sprachbeschreibung und erstellt einen Workflow-Vorschlag
 */
export async function analyzeDescription(input: WizardInput): Promise<WizardOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: WIZARD_MODEL,
        max_tokens: 1500,
        system: `Du bist ein Workflow-Planer. Analysiere die Beschreibung und erstelle einen strukturierten Plan.

Antworte NUR als JSON mit diesem Format:
{
  "task": "Klare Aufgabenbeschreibung für den Computer Use Agent",
  "urls": ["https://website1.com", "https://website2.com"],
  "schedule": "Cron-Ausdruck oder null (z.B. '0 9 * * 1' für jeden Montag 9:00)",
  "extractFields": ["preis", "feature", "etc"],
  "outputFormat": "csv" | "json" | "text",
  "notifyVia": "email" | "slack" | "webhook" | null,
  "enableCodeExecution": true/false (true wenn Daten verarbeitet/analysiert werden müssen),
  "enableVerification": true/false (true wenn genaue Daten wichtig sind),
  "enableProceduralMemory": true/false (true wenn Task wiederholt wird),
  "reasoning": "Warum dieser Aufbau gewählt wurde"
}

Beachte:
- Cron-Format: Minute Stunde Tag Monat Wochentag
- enableCodeExecution: wenn Daten gefiltert, verglichen, oder visualisiert werden sollen
- enableVerification: wenn die Ergebnisse genau sein müssen (z.B. Preisvergleich)
- enableProceduralMemory: wenn der gleiche Task regelmäßig ausgeführt wird`,
        messages: [
          { role: "user", content: input.description },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      task?: string;
      urls?: string[];
      schedule?: string;
      extractFields?: string[];
      outputFormat?: string;
      notifyVia?: string;
      enableCodeExecution?: boolean;
      enableVerification?: boolean;
      enableProceduralMemory?: boolean;
      reasoning?: string;
    };

    // Workflow-Nodes generieren
    const suggestedNodes = generateSuggestedNodes(parsed);

    return {
      task: parsed.task || input.description,
      urls: parsed.urls || [],
      schedule: parsed.schedule || undefined,
      extractFields: parsed.extractFields || [],
      outputFormat: (parsed.outputFormat as WizardOutput["outputFormat"]) || "json",
      notifyVia: (parsed.notifyVia as WizardOutput["notifyVia"]) || null,
      enableCodeExecution: parsed.enableCodeExecution === true,
      enableVerification: parsed.enableVerification !== false,
      enableProceduralMemory: parsed.enableProceduralMemory !== false,
      suggestedNodes,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return null;
  }
}

/**
 * Generiert Workflow-Nodes aus dem analysierten Plan
 */
function generateSuggestedNodes(
  plan: Record<string, unknown>,
): SuggestedNode[] {
  const nodes: SuggestedNode[] = [];
  let x = 100;
  const y = 200;
  const spacing = 300;

  // 1. Trigger Node
  if (plan.schedule) {
    nodes.push({
      type: "trigger_schedule",
      label: "Zeitplan",
      config: { cron: String(plan.schedule) },
      position: { x, y },
    });
  } else {
    nodes.push({
      type: "trigger_manual",
      label: "Manueller Start",
      config: {},
      position: { x, y },
    });
  }
  x += spacing;

  // 2. Computer Use Node (für jede URL)
  const urls = Array.isArray(plan.urls) ? plan.urls : [];
  const task = String(plan.task || "");
  const extractFields = Array.isArray(plan.extractFields) ? plan.extractFields : [];

  if (urls.length === 0) {
    // Einzelner Computer Use Node ohne spezifische URL
    nodes.push({
      type: "computer_use",
      label: "Browser-Agent",
      config: {
        task,
        startUrl: "",
        captureScreenshots: true,
        enableCodeExecution: plan.enableCodeExecution === true,
        enableVerification: plan.enableVerification !== false,
        enableProceduralMemory: plan.enableProceduralMemory !== false,
        extractData: extractFields.length > 0,
        maxSteps: 15,
        browserMode: "real",
      },
      position: { x, y },
    });
    x += spacing;
  } else {
    for (const url of urls) {
      nodes.push({
        type: "computer_use",
        label: `Browse: ${new URL(String(url)).hostname}`,
        config: {
          task,
          startUrl: String(url),
          captureScreenshots: true,
          enableCodeExecution: plan.enableCodeExecution === true,
          enableVerification: plan.enableVerification !== false,
          enableProceduralMemory: plan.enableProceduralMemory !== false,
          extractData: extractFields.length > 0,
          maxSteps: 15,
          browserMode: "real",
        },
        position: { x, y: y + (nodes.length - 1) * 150 },
      });
    }
    x += spacing;
  }

  // 3. Code Sandbox Node (wenn Datenverarbeitung nötig)
  if (plan.enableCodeExecution) {
    const outputFormat = String(plan.outputFormat || "json");
    nodes.push({
      type: "code_sandbox",
      label: "Daten verarbeiten",
      config: {
        language: "python",
        goal: `Verarbeite die extrahierten Daten und erstelle eine ${outputFormat}-Ausgabe mit den Feldern: ${extractFields.join(", ")}`,
        maxIterations: 3,
        packages: outputFormat === "csv" ? ["pandas"] : [],
      },
      position: { x, y },
    });
    x += spacing;
  }

  // 4. Notification Node
  const notifyVia = String(plan.notifyVia || "");
  if (notifyVia === "email") {
    nodes.push({
      type: "gmail_send",
      label: "E-Mail senden",
      config: {
        subject: `Ergebnis: ${task.slice(0, 50)}`,
        body: "{{computerUseResult.summary}}",
      },
      position: { x, y },
    });
  } else if (notifyVia === "slack") {
    nodes.push({
      type: "slack_send_integration",
      label: "Slack senden",
      config: {
        message: `Ergebnis: {{computerUseResult.summary}}`,
      },
      position: { x, y },
    });
  } else if (notifyVia === "webhook") {
    nodes.push({
      type: "http_request",
      label: "Webhook senden",
      config: {
        method: "POST",
        url: "",
        body: "{{JSON.stringify(computerUseResult)}}",
      },
      position: { x, y },
    });
  }

  return nodes;
}
