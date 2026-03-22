#!/usr/bin/env node

/**
 * KILN CLI — Kommandozeile für die KILN AI Platform
 *
 * Usage:
 *   kiln login
 *   kiln agents list
 *   kiln agents create --name "Sales Bot" --prompt "Du bist ein Sales Agent..."
 *   kiln agents chat <id> --message "Hallo"
 *   kiln workflows list
 *   kiln workflows trigger <id> --goal "Generate weekly report"
 *   kiln credits
 *   kiln health
 */

import { KilnSDK, KilnAPIError } from "./kiln-sdk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";

// ── Config ───────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), ".kiln");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface CLIConfig {
  apiKey: string;
  baseUrl: string;
}

function loadConfig(): CLIConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {
    // ignore
  }
  return null;
}

function saveConfig(config: CLIConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  // Nur Owner darf lesen/schreiben
  fs.chmodSync(CONFIG_FILE, 0o600);
}

function getSDK(): KilnSDK {
  const config = loadConfig();
  if (!config?.apiKey) {
    console.error("Nicht eingeloggt. Bitte zuerst: kiln login");
    process.exit(1);
  }
  return new KilnSDK({ apiKey: config.apiKey, baseUrl: config.baseUrl });
}

// ── Output Helpers ───────────────────────────────────────────

let outputJson = false;

function print(data: unknown): void {
  if (outputJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("Keine Ergebnisse.");
      return;
    }
    printTable(data);
    return;
  }

  if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
    return;
  }

  console.log(data);
}

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;

  const keys = Object.keys(rows[0]);
  const widths = keys.map((key) =>
    Math.max(
      key.length,
      ...rows.map((row) => String(row[key] ?? "").length)
    )
  );

  // Header
  const header = keys.map((key, i) => key.padEnd(widths[i])).join("  ");
  console.log(header);
  console.log(widths.map((w) => "-".repeat(w)).join("  "));

  // Rows
  for (const row of rows) {
    const line = keys.map((key, i) => String(row[key] ?? "").padEnd(widths[i])).join("  ");
    console.log(line);
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Commands ─────────────────────────────────────────────────

async function cmdLogin(): Promise<void> {
  const apiKey = await prompt("API Key (sk-kiln-...): ");
  if (!apiKey.startsWith("sk-kiln-")) {
    console.error("Ungültiger API Key. Muss mit sk-kiln- beginnen.");
    process.exit(1);
  }

  const baseUrl = (await prompt("Base URL (Enter für https://app.kiln.ai): ")) || "https://app.kiln.ai";

  // Verbindung testen
  try {
    const sdk = new KilnSDK({ apiKey, baseUrl });
    await sdk.agents.list();
    console.log("Erfolgreich verbunden!");
    saveConfig({ apiKey, baseUrl });
    console.log(`Konfiguration gespeichert in ${CONFIG_FILE}`);
  } catch (err) {
    if (err instanceof KilnAPIError) {
      console.error(`Fehler: ${err.message}`);
    } else {
      console.error("Verbindung fehlgeschlagen. Bitte API Key und URL prüfen.");
    }
    process.exit(1);
  }
}

async function cmdAgentsList(): Promise<void> {
  const sdk = getSDK();
  const agents = await sdk.agents.list();
  print(
    agents.map((a) => ({
      ID: a.id,
      Name: a.name,
      Status: a.status,
      Chats: a.conversationCount,
      Erstellt: new Date(a.createdAt).toLocaleDateString("de-DE"),
    }))
  );
}

async function cmdAgentsCreate(args: string[]): Promise<void> {
  const sdk = getSDK();
  const name = getFlag(args, "--name");
  const promptText = getFlag(args, "--prompt");

  if (!name || !promptText) {
    console.error("Usage: kiln agents create --name <name> --prompt <system-prompt>");
    process.exit(1);
  }

  const result = await sdk.agents.create({
    name,
    systemPrompt: promptText,
    status: "LIVE",
  });
  console.log(`Agent erstellt: ${result.id} (${result.slug})`);
}

async function cmdAgentsChat(args: string[]): Promise<void> {
  const sdk = getSDK();
  const agentId = args[0];
  const message = getFlag(args, "--message") || getFlag(args, "-m");

  if (!agentId || !message) {
    console.error("Usage: kiln agents chat <id> --message <text>");
    process.exit(1);
  }

  const result = await sdk.agents.chat(agentId, { message });
  console.log(result.response);
}

async function cmdWorkflowsList(): Promise<void> {
  const sdk = getSDK();
  const workflows = await sdk.workflows.list();
  print(
    workflows.map((w) => ({
      ID: w.id,
      Name: w.name,
      Status: w.status,
      Members: w.memberCount,
      Erstellt: new Date(w.createdAt).toLocaleDateString("de-DE"),
    }))
  );
}

async function cmdWorkflowsTrigger(args: string[]): Promise<void> {
  const sdk = getSDK();
  const workflowId = args[0];
  const goal = getFlag(args, "--goal");

  if (!workflowId || !goal) {
    console.error("Usage: kiln workflows trigger <id> --goal <text>");
    process.exit(1);
  }

  const execution = await sdk.workflows.trigger(workflowId, { goal });
  console.log(`Workflow gestartet: ${execution.id}`);
  console.log(`Status: ${execution.status}`);
}

async function cmdWorkflowsStatus(args: string[]): Promise<void> {
  const sdk = getSDK();
  const executionId = args[0];

  if (!executionId) {
    console.error("Usage: kiln workflows status <execution-id>");
    process.exit(1);
  }

  const execution = await sdk.workflows.getExecution(executionId);
  print(execution);
}

async function cmdCredits(): Promise<void> {
  const sdk = getSDK();
  const balance = await sdk.credits.getBalance();
  console.log(`Credits: ${balance.balance} / ${balance.monthly}`);
  if (balance.resetDate) {
    console.log(`Nächster Reset: ${new Date(balance.resetDate).toLocaleDateString("de-DE")}`);
  }
}

async function cmdHealth(): Promise<void> {
  const sdk = getSDK();
  const health = await sdk.analytics.getHealth();
  print(health);
}

// ── Helpers ──────────────────────────────────────────────────

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return undefined;
  return args[idx + 1];
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Global flags
  if (args.includes("--json")) {
    outputJson = true;
    args.splice(args.indexOf("--json"), 1);
  }

  const command = args[0];
  const subcommand = args[1];
  const restArgs = args.slice(2);

  try {
    if (command === "login") {
      await cmdLogin();
    } else if (command === "agents") {
      if (subcommand === "list" || !subcommand) {
        await cmdAgentsList();
      } else if (subcommand === "create") {
        await cmdAgentsCreate(restArgs);
      } else if (subcommand === "chat") {
        await cmdAgentsChat(restArgs);
      } else {
        console.error(`Unbekannter Befehl: agents ${subcommand}`);
        process.exit(1);
      }
    } else if (command === "workflows") {
      if (subcommand === "list" || !subcommand) {
        await cmdWorkflowsList();
      } else if (subcommand === "trigger") {
        await cmdWorkflowsTrigger(restArgs);
      } else if (subcommand === "status") {
        await cmdWorkflowsStatus(restArgs);
      } else {
        console.error(`Unbekannter Befehl: workflows ${subcommand}`);
        process.exit(1);
      }
    } else if (command === "credits") {
      await cmdCredits();
    } else if (command === "health") {
      await cmdHealth();
    } else if (command === "--help" || command === "-h" || !command) {
      console.log(`
KILN CLI — AI Creation Platform

Befehle:
  kiln login                          API Key konfigurieren
  kiln agents list                    Alle Agents auflisten
  kiln agents create --name --prompt  Neuen Agent erstellen
  kiln agents chat <id> -m <text>     Mit Agent chatten
  kiln workflows list                 Workflows auflisten
  kiln workflows trigger <id> --goal  Workflow starten
  kiln workflows status <id>          Execution-Status prüfen
  kiln credits                        Credit-Balance anzeigen
  kiln health                         System-Gesundheit prüfen

Optionen:
  --json        JSON-Output statt Tabellen
  --help, -h    Hilfe anzeigen
      `);
    } else {
      console.error(`Unbekannter Befehl: ${command}. Nutze --help für Hilfe.`);
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof KilnAPIError) {
      console.error(`Fehler (${err.status}): ${err.message}`);
    } else if (err instanceof Error) {
      console.error(`Fehler: ${err.message}`);
    } else {
      console.error("Unbekannter Fehler");
    }
    process.exit(1);
  }
}

main();
