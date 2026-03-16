#!/usr/bin/env node

import path from "path";
import { promises as fs } from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Command } from "commander";
import { KilnApiClient, KilnApiError, getKilnConfigPath, writeStoredConfig, type AgentUpsertPayload } from "./api-client.js";
import { loadConfigFile } from "./config-schema.js";

function truncate(text: string, length = 120) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function getGlobalOptions(command: Command) {
  return command.optsWithGlobals() as {
    apiKey?: string;
    baseUrl?: string;
  };
}

async function getClient(command: Command) {
  const options = getGlobalOptions(command);
  return KilnApiClient.create({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });
}

function handleError(error: unknown) {
  if (error instanceof KilnApiError) {
    console.error(`KILN API error (${error.status}): ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
}

const program = new Command();

program
  .name("kiln")
  .description("KILN CLI for deploying and testing agents from local configs.")
  .version("0.1.0")
  .option("--api-key <key>", "Override the stored KILN API key")
  .option("--base-url <url>", "Override the KILN API base URL");

program
  .command("login")
  .description("Prompt for a KILN API key and save it to ~/.kilnrc")
  .action(async () => {
    const rl = createInterface({ input, output });
    try {
      const apiKey = (await rl.question("KILN API key: ")).trim();
      if (!apiKey.startsWith("sk-kiln-")) {
        throw new Error("API key must start with sk-kiln-");
      }

      const baseUrl = (await rl.question("API base URL (press enter for default): ")).trim();
      await writeStoredConfig({
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
      });

      console.log(`Saved credentials to ${getKilnConfigPath()}`);
    } finally {
      rl.close();
    }
  });

program
  .command("deploy")
  .description("Create or update an agent from a YAML config file")
  .argument("<config.yml>", "Path to the YAML config file")
  .action(async (configPath: string, command: Command) => {
    const client = await getClient(command);
    const { config, path: absoluteConfigPath } = await loadConfigFile(configPath);
    const { agents } = await client.listAgents();

    const existing = agents.find((agent) => agent.name === config.name);
    const whiteLabel = {
      ...(config.whiteLabel || {}),
      ...(config.embed
        ? {
            position: config.embed.position,
            embedType: config.embed.type,
          }
        : {}),
    };

    const payload: AgentUpsertPayload = {
      name: config.name,
      agentMode: config.type === "task" ? "TASK" : "CHAT",
      llmModel: config.model,
      systemPrompt: config.systemPrompt,
      ...(config.greeting ? { welcomeMessage: config.greeting } : {}),
      ...(config.actions.length ? { actions: config.actions } : {}),
      ...(Object.keys(whiteLabel).length ? { whiteLabel } : {}),
      status: "LIVE" as const,
    };

    const result = existing
      ? await client.updateAgent(existing.id, payload)
      : await client.createAgent(payload);

    if (config.knowledge?.urls.length) {
      for (const url of config.knowledge.urls) {
        await client.addKnowledge(result.id, {
          type: "URL",
          sourceName: url,
          content: url,
        });
      }
    }

    if (config.knowledge?.files.length) {
      for (const filePath of config.knowledge.files) {
        const absoluteFilePath = path.resolve(path.dirname(absoluteConfigPath), filePath);
        const fileContent = await fs.readFile(absoluteFilePath, "utf8");
        await client.addKnowledge(result.id, {
          type: "TEXT",
          sourceName: path.basename(absoluteFilePath),
          content: fileContent,
        });
      }
    }

    console.log(`${existing ? "Updated" : "Created"} agent ${result.name} (${result.id})`);
    console.log(`Status: ${result.status}`);
    if (result.publicUrl) {
      console.log(`Public URL: ${result.publicUrl}`);
    }
  });

program
  .command("list")
  .description("List all agents for the authenticated account")
  .action(async (_: unknown, command: Command) => {
    const client = await getClient(command);
    const { agents } = await client.listAgents();

    if (!agents.length) {
      console.log("No agents found.");
      return;
    }

    console.table(
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        conversations: agent.conversationCount,
      }))
    );
  });

program
  .command("logs")
  .description("Show recent conversation logs for an agent")
  .argument("<agentId>", "Agent ID")
  .option("-n, --limit <number>", "Number of conversations to return", "5")
  .action(async (agentId: string, options: { limit: string }, command: Command) => {
    const client = await getClient(command);
    const limit = Math.max(1, Math.min(50, Number.parseInt(options.limit, 10) || 5));
    const { conversations } = await client.getLogs(agentId, limit);

    if (!conversations.length) {
      console.log("No conversations found.");
      return;
    }

    for (const conversation of conversations) {
      console.log(`\n[${conversation.createdAt}] ${conversation.id} (${conversation.channel})`);
      if (conversation.visitorEmail || conversation.visitorName) {
        console.log(`Visitor: ${conversation.visitorName || "Unknown"} ${conversation.visitorEmail ? `<${conversation.visitorEmail}>` : ""}`.trim());
      }
      for (const message of conversation.messages) {
        console.log(`${message.role}: ${truncate(message.content, 220)}`);
      }
    }
  });

program
  .command("test")
  .description("Send a test message to an agent")
  .argument("<agentId>", "Agent ID")
  .argument("<message>", "Message to send")
  .option("-s, --session <id>", "Session ID for continued conversations")
  .action(
    async (
      agentId: string,
      message: string,
      options: { session?: string },
      command: Command
    ) => {
      const client = await getClient(command);
      const result = await client.testAgent(agentId, message, options.session);

      console.log(`Session: ${result.sessionId}`);
      console.log(`Conversation: ${result.conversationId}`);
      console.log(`Model: ${result.model}`);
      console.log("");
      console.log(result.response);
    }
  );

program.parseAsync(process.argv).catch(handleError);
