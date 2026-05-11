-- Sub-Account module configs for AI / SMS / Voice / WhatsApp with
-- pool vs byok_agency vs byok_customer modes. Credentials stored
-- encrypted via the Sprint 18 config-storage layer. Idempotent.

CREATE TABLE IF NOT EXISTS "SubAccountModuleConfig" (
  "id" TEXT NOT NULL,
  "subAccountId" TEXT NOT NULL,
  "moduleName" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'pool',
  "encryptedCredentials" TEXT,
  "credentialsOwner" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "lastValidatedAt" TIMESTAMP(3),
  "validationError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubAccountModuleConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubAccountModuleConfig_subAccountId_moduleName_key"
  ON "SubAccountModuleConfig"("subAccountId", "moduleName");

CREATE INDEX IF NOT EXISTS "SubAccountModuleConfig_subAccountId_idx"
  ON "SubAccountModuleConfig"("subAccountId");

CREATE INDEX IF NOT EXISTS "SubAccountModuleConfig_mode_isActive_idx"
  ON "SubAccountModuleConfig"("mode", "isActive");

CREATE INDEX IF NOT EXISTS "SubAccountModuleConfig_moduleName_isActive_idx"
  ON "SubAccountModuleConfig"("moduleName", "isActive");
