import type { Prisma, SubAccountModuleConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptConfigJson, readConfigJson } from "@/lib/integrations/config-storage";
import {
  MODULE_NAMES,
  isModuleMode,
  type AiModuleCredentials,
  type ModuleCredentials,
  type ModuleMode,
  type ModuleName,
  type TwilioModuleCredentials,
} from "./types";

export interface UpsertModuleConfigArgs {
  subAccountId: string;
  moduleName: ModuleName;
  mode: ModuleMode;
  credentials?: ModuleCredentials | null;
  credentialsOwner?: string | null;
  isActive?: boolean;
}

export interface ToggleModuleConfigArgs {
  subAccountId: string;
  moduleName: ModuleName;
  isActive: boolean;
}

const VALID_MODES_FOR_CREDENTIALS: ModuleMode[] = ["byok_agency", "byok_customer"];

/**
 * Create-or-update a SubAccountModuleConfig row. Encrypts credentials
 * via the Sprint 18 helper when provided; clears them when the new mode
 * is `pool`. Idempotent — safe to call repeatedly.
 */
export async function upsertModuleConfig(args: UpsertModuleConfigArgs): Promise<SubAccountModuleConfig> {
  if (!isModuleMode(args.mode)) {
    throw new Error(`Invalid module mode: ${args.mode}`);
  }
  const encryptedCredentials =
    args.mode === "pool"
      ? null
      : args.credentials
        ? encryptConfigJson(args.credentials)
        : undefined; // undefined = keep existing row's value on update

  // For BYOK modes, require credentials owner string for audit trail.
  if (VALID_MODES_FOR_CREDENTIALS.includes(args.mode) && !args.credentialsOwner && args.credentials) {
    throw new Error(`credentialsOwner is required when storing BYOK credentials`);
  }

  const data: Prisma.SubAccountModuleConfigUncheckedCreateInput = {
    subAccountId: args.subAccountId,
    moduleName: args.moduleName,
    mode: args.mode,
    encryptedCredentials: encryptedCredentials ?? null,
    credentialsOwner: args.mode === "pool" ? null : args.credentialsOwner ?? null,
    isActive: args.isActive ?? true,
  };

  return prisma.subAccountModuleConfig.upsert({
    where: { subAccountId_moduleName: { subAccountId: args.subAccountId, moduleName: args.moduleName } },
    create: data,
    update: {
      mode: data.mode,
      ...(encryptedCredentials !== undefined ? { encryptedCredentials } : {}),
      credentialsOwner: data.credentialsOwner,
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
    },
  });
}

export async function toggleModuleActive(args: ToggleModuleConfigArgs): Promise<SubAccountModuleConfig> {
  return prisma.subAccountModuleConfig.upsert({
    where: { subAccountId_moduleName: { subAccountId: args.subAccountId, moduleName: args.moduleName } },
    create: {
      subAccountId: args.subAccountId,
      moduleName: args.moduleName,
      mode: "pool",
      isActive: args.isActive,
    },
    update: { isActive: args.isActive },
  });
}

export async function findModuleConfig(args: {
  subAccountId: string;
  moduleName: ModuleName;
}): Promise<SubAccountModuleConfig | null> {
  return prisma.subAccountModuleConfig.findUnique({
    where: { subAccountId_moduleName: { subAccountId: args.subAccountId, moduleName: args.moduleName } },
  });
}

export async function listModuleConfigs(subAccountId: string): Promise<SubAccountModuleConfig[]> {
  const rows = await prisma.subAccountModuleConfig.findMany({
    where: { subAccountId },
    orderBy: { moduleName: "asc" },
  });
  // Ensure consumers always get all 4 module slots in their response.
  const byName = new Map(rows.map((row) => [row.moduleName, row] as const));
  return MODULE_NAMES.map((name) => byName.get(name) ?? null).filter(
    (row): row is SubAccountModuleConfig => row !== null,
  );
}

export function decryptModuleCredentials<T extends ModuleCredentials = ModuleCredentials>(
  row: Pick<SubAccountModuleConfig, "encryptedCredentials">,
): T | null {
  if (!row.encryptedCredentials) return null;
  try {
    return readConfigJson<T>(row.encryptedCredentials).data;
  } catch (err) {
    console.warn("[module-store] failed to decrypt module credentials", err);
    return null;
  }
}

/**
 * Backfill helper: idempotently insert a `pool` / `isActive=false` row for
 * each (subAccountId, moduleName) pair so the settings UI always finds 4
 * rows to render. Called once at deploy and as needed for newly-created
 * Sub-Orgs.
 */
export async function ensureDefaultModuleConfigs(subAccountId: string): Promise<number> {
  let inserted = 0;
  for (const moduleName of MODULE_NAMES) {
    const result = await prisma.subAccountModuleConfig.upsert({
      where: { subAccountId_moduleName: { subAccountId, moduleName } },
      create: { subAccountId, moduleName, mode: "pool", isActive: false },
      update: {}, // never touch an existing row
      select: { createdAt: true, updatedAt: true },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted += 1;
  }
  return inserted;
}

export type ParsedAiCredentials = AiModuleCredentials;
export type ParsedTwilioCredentials = TwilioModuleCredentials;
