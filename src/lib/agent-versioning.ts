import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  ActionType,
  Agent,
  AgentAction,
  AgentStatus,
  AgentVisibility,
  ModelProvider,
} from "@prisma/client";

type VersioningClient = Prisma.TransactionClient | typeof prisma;

type SnapshotAction = {
  type: ActionType;
  enabled: boolean;
  config: Prisma.JsonValue | null;
};

export type AgentVersionConfig = {
  name: string;
  systemPrompt: string;
  personality: Prisma.JsonValue | null;
  welcomeMessage: string | null;
  suggestedQuestions: string[];
  llmModel: string;
  temperature: number;
  modelProvider: ModelProvider;
  status: AgentStatus;
  whiteLabel: Prisma.JsonValue | null;
  showPoweredBy: boolean;
  autoDetectLanguage: boolean;
  memoryEnabled: boolean;
  visitorMemoryEnabled: boolean;
  imageAnalysisEnabled: boolean;
  showAiDisclaimer: boolean;
  promptBranches: Prisma.JsonValue | null;
  visibility: AgentVisibility;
  customDomain: string | null;
  actions: SnapshotAction[];
};

type VersionableAgent = Pick<
  Agent,
  | "name"
  | "systemPrompt"
  | "personality"
  | "welcomeMessage"
  | "suggestedQuestions"
  | "llmModel"
  | "temperature"
  | "modelProvider"
  | "status"
  | "whiteLabel"
  | "showPoweredBy"
  | "autoDetectLanguage"
  | "memoryEnabled"
  | "visitorMemoryEnabled"
  | "imageAnalysisEnabled"
  | "showAiDisclaimer"
  | "promptBranches"
  | "visibility"
  | "customDomain"
> & {
  actions: Pick<AgentAction, "type" | "enabled" | "config">[];
};

type VersionCreateResult = {
  version: number;
  currentVersion: number;
  changelog: string;
};

function normalizeObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeObjectKeys(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeObjectKeys(entry)])
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeObjectKeys(value));
}

function formatTemperature(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.70";
}

function getActionMap(actions: SnapshotAction[]) {
  return new Map(actions.map((action) => [action.type, action]));
}

function buildActionChangeLog(previousActions: SnapshotAction[], nextActions: SnapshotAction[]) {
  const parts: string[] = [];
  const previousMap = getActionMap(previousActions);
  const nextMap = getActionMap(nextActions);

  for (const type of Array.from(nextMap.keys())) {
    if (!previousMap.has(type)) {
      parts.push(`added ${type} action`);
      continue;
    }

    const previous = previousMap.get(type);
    const next = nextMap.get(type);
    if (!previous || !next) continue;

    if (previous.enabled !== next.enabled) {
      parts.push(`${next.enabled ? "enabled" : "disabled"} ${type} action`);
      continue;
    }

    if (stableStringify(previous.config) !== stableStringify(next.config)) {
      parts.push(`updated ${type} action`);
    }
  }

  for (const type of Array.from(previousMap.keys())) {
    if (!nextMap.has(type)) {
      parts.push(`removed ${type} action`);
    }
  }

  return parts;
}

function summarizeChanges(parts: string[]) {
  if (parts.length === 0) {
    return "Saved without config changes";
  }

  if (parts.length <= 4) {
    return `${parts[0][0].toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `, ${parts.slice(1).join(", ")}` : ""}`;
  }

  const visible = parts.slice(0, 4);
  return `${visible[0][0].toUpperCase()}${visible[0].slice(1)}, ${visible.slice(1).join(", ")}, +${parts.length - visible.length} more changes`;
}

function buildChangelog(previousConfig: AgentVersionConfig, nextConfig: AgentVersionConfig) {
  const changes: string[] = [];

  if (previousConfig.name !== nextConfig.name) {
    changes.push(`renamed agent from ${previousConfig.name} to ${nextConfig.name}`);
  }

  if (previousConfig.systemPrompt !== nextConfig.systemPrompt) {
    changes.push("changed system prompt");
  }

  if (previousConfig.llmModel !== nextConfig.llmModel) {
    changes.push(`switched model from ${previousConfig.llmModel} to ${nextConfig.llmModel}`);
  }

  if (previousConfig.temperature !== nextConfig.temperature) {
    changes.push(
      `adjusted temperature from ${formatTemperature(previousConfig.temperature)} to ${formatTemperature(nextConfig.temperature)}`
    );
  }

  if (previousConfig.welcomeMessage !== nextConfig.welcomeMessage) {
    changes.push("updated greeting");
  }

  if (stableStringify(previousConfig.personality) !== stableStringify(nextConfig.personality)) {
    changes.push("updated personality");
  }

  if (stableStringify(previousConfig.whiteLabel) !== stableStringify(nextConfig.whiteLabel)) {
    changes.push("updated white-label settings");
  }

  if (previousConfig.status !== nextConfig.status) {
    changes.push(`changed status from ${previousConfig.status} to ${nextConfig.status}`);
  }

  if (previousConfig.customDomain !== nextConfig.customDomain) {
    changes.push("updated custom domain");
  }

  changes.push(...buildActionChangeLog(previousConfig.actions, nextConfig.actions));

  if (
    stableStringify(previousConfig.promptBranches) !== stableStringify(nextConfig.promptBranches)
  ) {
    changes.push("updated prompt branches");
  }

  return summarizeChanges(changes);
}

function sanitizeActions(actions: VersionableAgent["actions"]): SnapshotAction[] {
  return actions.map((action) => ({
    type: action.type,
    enabled: action.enabled,
    config: (action.config as Prisma.JsonValue | null) ?? null,
  }));
}

export function snapshotAgentConfig(agent: VersionableAgent): AgentVersionConfig {
  return {
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    personality: (agent.personality as Prisma.JsonValue | null) ?? null,
    welcomeMessage: agent.welcomeMessage,
    suggestedQuestions: Array.isArray(agent.suggestedQuestions) ? agent.suggestedQuestions : [],
    llmModel: agent.llmModel,
    temperature: typeof agent.temperature === "number" ? agent.temperature : 0.7,
    modelProvider: agent.modelProvider,
    status: agent.status,
    whiteLabel: (agent.whiteLabel as Prisma.JsonValue | null) ?? null,
    showPoweredBy: agent.showPoweredBy,
    autoDetectLanguage: agent.autoDetectLanguage,
    memoryEnabled: agent.memoryEnabled,
    visitorMemoryEnabled: agent.visitorMemoryEnabled,
    imageAnalysisEnabled: agent.imageAnalysisEnabled,
    showAiDisclaimer: agent.showAiDisclaimer,
    promptBranches: (agent.promptBranches as Prisma.JsonValue | null) ?? null,
    visibility: agent.visibility,
    customDomain: agent.customDomain,
    actions: sanitizeActions(agent.actions),
  };
}

export function applyAgentUpdateToVersionConfig(
  previousConfig: AgentVersionConfig,
  updates: Record<string, unknown>
): AgentVersionConfig {
  return {
    ...previousConfig,
    ...(typeof updates.name === "string" ? { name: updates.name } : {}),
    ...(typeof updates.systemPrompt === "string" ? { systemPrompt: updates.systemPrompt } : {}),
    ...(updates.personality !== undefined
      ? { personality: (updates.personality as Prisma.JsonValue | null) ?? null }
      : {}),
    ...(updates.welcomeMessage !== undefined
      ? { welcomeMessage: (updates.welcomeMessage as string | null) ?? null }
      : {}),
    ...(Array.isArray(updates.suggestedQuestions)
      ? {
          suggestedQuestions: updates.suggestedQuestions.filter(
            (entry): entry is string => typeof entry === "string"
          ),
        }
      : {}),
    ...(typeof updates.llmModel === "string" ? { llmModel: updates.llmModel } : {}),
    ...(updates.temperature !== undefined
      ? {
          temperature:
            typeof updates.temperature === "number"
              ? updates.temperature
              : Number.isFinite(Number(updates.temperature))
                ? Number(updates.temperature)
                : previousConfig.temperature,
        }
      : {}),
    ...(typeof updates.modelProvider === "string"
      ? { modelProvider: updates.modelProvider as ModelProvider }
      : {}),
    ...(typeof updates.status === "string"
      ? { status: updates.status as AgentStatus }
      : {}),
    ...(updates.whiteLabel !== undefined
      ? { whiteLabel: (updates.whiteLabel as Prisma.JsonValue | null) ?? null }
      : {}),
    ...(typeof updates.showPoweredBy === "boolean"
      ? { showPoweredBy: updates.showPoweredBy }
      : {}),
    ...(typeof updates.autoDetectLanguage === "boolean"
      ? { autoDetectLanguage: updates.autoDetectLanguage }
      : {}),
    ...(typeof updates.memoryEnabled === "boolean"
      ? { memoryEnabled: updates.memoryEnabled }
      : {}),
    ...(typeof updates.visitorMemoryEnabled === "boolean"
      ? { visitorMemoryEnabled: updates.visitorMemoryEnabled }
      : {}),
    ...(typeof updates.imageAnalysisEnabled === "boolean"
      ? { imageAnalysisEnabled: updates.imageAnalysisEnabled }
      : {}),
    ...(typeof updates.showAiDisclaimer === "boolean"
      ? { showAiDisclaimer: updates.showAiDisclaimer }
      : {}),
    ...(updates.promptBranches !== undefined
      ? { promptBranches: (updates.promptBranches as Prisma.JsonValue | null) ?? null }
      : {}),
    ...(typeof updates.visibility === "string"
      ? { visibility: updates.visibility as AgentVisibility }
      : {}),
    ...(updates.customDomain !== undefined
      ? { customDomain: (updates.customDomain as string | null) ?? null }
      : {}),
    ...(Array.isArray(updates.actions)
      ? {
          actions: updates.actions
            .filter(
              (entry): entry is Record<string, unknown> =>
                Boolean(entry) && typeof entry === "object" && typeof entry.type === "string"
            )
            .map((entry) => ({
              type: entry.type as ActionType,
              enabled: entry.enabled !== false,
              config: (entry.config as Prisma.JsonValue | null) ?? null,
            })),
        }
      : {}),
  };
}

async function pruneVersions(client: VersioningClient, agentId: string) {
  const staleVersions = await client.agentVersion.findMany({
    where: { agentId },
    orderBy: { version: "desc" },
    skip: 50,
    select: { id: true },
  });

  if (staleVersions.length === 0) return;

  await client.agentVersion.deleteMany({
    where: {
      id: {
        in: staleVersions.map((version) => version.id),
      },
    },
  });
}

async function createVersionRecord({
  client,
  agentId,
  userId,
  config,
  changelog,
}: {
  client: VersioningClient;
  agentId: string;
  userId: string;
  config: AgentVersionConfig;
  changelog: string;
}) {
  const lastVersion = await client.agentVersion.findFirst({
    where: { agentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (lastVersion?.version || 0) + 1;

  const version = await client.agentVersion.create({
    data: {
      agentId,
      version: nextVersion,
      config: config as Prisma.InputJsonValue,
      changelog,
      createdBy: userId,
    },
  });

  await pruneVersions(client, agentId);

  return version;
}

export async function createVersion(
  agentId: string,
  userId: string,
  previousConfig: AgentVersionConfig,
  newConfig: AgentVersionConfig
): Promise<VersionCreateResult> {
  const changelog = buildChangelog(previousConfig, newConfig);
  const version = await createVersionRecord({
    client: prisma,
    agentId,
    userId,
    config: previousConfig,
    changelog,
  });

  return {
    version: version.version,
    currentVersion: version.version + 1,
    changelog,
  };
}

export async function createManualVersionSnapshot(
  agentId: string,
  userId: string,
  config: AgentVersionConfig,
  changelog = "Manual snapshot created"
) {
  const version = await createVersionRecord({
    client: prisma,
    agentId,
    userId,
    config,
    changelog,
  });

  return {
    version: version.version,
    currentVersion: version.version,
    changelog,
  };
}

export async function getVersionHistory(agentId: string) {
  return prisma.agentVersion.findMany({
    where: { agentId },
    orderBy: { version: "desc" },
    take: 50,
  });
}

export async function getCurrentVersionNumber(
  agentId: string,
  currentConfig: AgentVersionConfig
) {
  const latestVersion = await prisma.agentVersion.findFirst({
    where: { agentId },
    orderBy: { version: "desc" },
    select: { version: true, config: true },
  });

  if (!latestVersion) {
    return 1;
  }

  return stableStringify(latestVersion.config) === stableStringify(currentConfig)
    ? latestVersion.version
    : latestVersion.version + 1;
}

function parseVersionConfig(raw: Prisma.JsonValue | null | undefined): AgentVersionConfig {
  const snapshot = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  return {
    name: typeof snapshot.name === "string" ? snapshot.name : "",
    systemPrompt: typeof snapshot.systemPrompt === "string" ? snapshot.systemPrompt : "",
    personality: (snapshot.personality as Prisma.JsonValue | null) ?? null,
    welcomeMessage:
      snapshot.welcomeMessage === null || typeof snapshot.welcomeMessage === "string"
        ? (snapshot.welcomeMessage as string | null)
        : null,
    suggestedQuestions: Array.isArray(snapshot.suggestedQuestions)
      ? snapshot.suggestedQuestions.filter((entry): entry is string => typeof entry === "string")
      : [],
    llmModel: typeof snapshot.llmModel === "string" ? snapshot.llmModel : "",
    temperature:
      typeof snapshot.temperature === "number" ? snapshot.temperature : 0.7,
    modelProvider:
      typeof snapshot.modelProvider === "string"
        ? (snapshot.modelProvider as ModelProvider)
        : "ANTHROPIC",
    status:
      typeof snapshot.status === "string" ? (snapshot.status as AgentStatus) : "DRAFT",
    whiteLabel: (snapshot.whiteLabel as Prisma.JsonValue | null) ?? null,
    showPoweredBy:
      typeof snapshot.showPoweredBy === "boolean" ? snapshot.showPoweredBy : true,
    autoDetectLanguage:
      typeof snapshot.autoDetectLanguage === "boolean" ? snapshot.autoDetectLanguage : true,
    memoryEnabled:
      typeof snapshot.memoryEnabled === "boolean" ? snapshot.memoryEnabled : false,
    visitorMemoryEnabled:
      typeof snapshot.visitorMemoryEnabled === "boolean"
        ? snapshot.visitorMemoryEnabled
        : true,
    imageAnalysisEnabled:
      typeof snapshot.imageAnalysisEnabled === "boolean"
        ? snapshot.imageAnalysisEnabled
        : false,
    showAiDisclaimer:
      typeof snapshot.showAiDisclaimer === "boolean" ? snapshot.showAiDisclaimer : true,
    promptBranches: (snapshot.promptBranches as Prisma.JsonValue | null) ?? null,
    visibility:
      typeof snapshot.visibility === "string" ? (snapshot.visibility as AgentVisibility) : "PUBLIC",
    customDomain:
      snapshot.customDomain === null || typeof snapshot.customDomain === "string"
        ? (snapshot.customDomain as string | null)
        : null,
    actions: Array.isArray(snapshot.actions)
      ? snapshot.actions
          .filter(
            (entry): entry is Record<string, unknown> =>
              Boolean(entry) && typeof entry === "object" && typeof entry.type === "string"
          )
          .map((entry) => ({
            type: entry.type as ActionType,
            enabled: entry.enabled !== false,
            config: (entry.config as Prisma.JsonValue | null) ?? null,
          }))
      : [],
  };
}

async function restoreAgentConfig(
  client: Prisma.TransactionClient,
  agentId: string,
  config: AgentVersionConfig
) {
  await client.agent.update({
    where: { id: agentId },
    data: {
      name: config.name,
      systemPrompt: config.systemPrompt,
      personality: (config.personality as Prisma.InputJsonValue | Prisma.JsonNullValueInput | undefined) ?? Prisma.JsonNull,
      welcomeMessage: config.welcomeMessage,
      suggestedQuestions: config.suggestedQuestions,
      llmModel: config.llmModel,
      temperature: config.temperature,
      modelProvider: config.modelProvider,
      status: config.status,
      whiteLabel:
        (config.whiteLabel as Prisma.InputJsonValue | Prisma.JsonNullValueInput | undefined) ??
        Prisma.JsonNull,
      showPoweredBy: config.showPoweredBy,
      autoDetectLanguage: config.autoDetectLanguage,
      memoryEnabled: config.memoryEnabled,
      visitorMemoryEnabled: config.visitorMemoryEnabled,
      imageAnalysisEnabled: config.imageAnalysisEnabled,
      showAiDisclaimer: config.showAiDisclaimer,
      promptBranches:
        (config.promptBranches as Prisma.InputJsonValue | Prisma.JsonNullValueInput | undefined) ??
        Prisma.JsonNull,
      visibility: config.visibility,
      customDomain: config.customDomain,
    },
  });

  await client.agentAction.deleteMany({
    where: { agentId },
  });

  if (config.actions.length > 0) {
    await client.agentAction.createMany({
      data: config.actions.map((action) => ({
        agentId,
        type: action.type,
        enabled: action.enabled,
        config:
          (action.config as Prisma.InputJsonValue | Prisma.JsonNullValueInput | undefined) ??
          Prisma.JsonNull,
      })),
    });
  }
}

export async function rollbackToVersion(agentId: string, versionId: string, userId: string) {
  const [agent, version] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        actions: {
          select: {
            type: true,
            enabled: true,
            config: true,
          },
        },
      },
    }),
    prisma.agentVersion.findFirst({
      where: { id: versionId, agentId },
    }),
  ]);

  if (!agent) {
    throw new Error("Agent not found");
  }

  if (!version) {
    throw new Error("Version not found");
  }

  const currentConfig = snapshotAgentConfig(agent);
  const targetConfig = parseVersionConfig(version.config as Prisma.JsonValue);

  return prisma.$transaction(async (tx) => {
    const rollbackSnapshot = await createVersionRecord({
      client: tx,
      agentId,
      userId,
      config: currentConfig,
      changelog: `Auto-saved before rollback to v${version.version}`,
    });

    await restoreAgentConfig(tx, agentId, targetConfig);

    return {
      restoredVersion: version.version,
      version: rollbackSnapshot.version,
      currentVersion: rollbackSnapshot.version + 1,
      changelog: rollbackSnapshot.changelog,
    };
  });
}

export function getVersionConfigForCompare(raw: Prisma.JsonValue | null | undefined) {
  const config = parseVersionConfig(raw);
  return {
    systemPrompt: config.systemPrompt,
    llmModel: config.llmModel,
    modelProvider: config.modelProvider,
    temperature: config.temperature,
  };
}
