-- Sprint 19.7.4 — per-sub-org LLM provider API keys (BYO).
--
-- Idempotent. Adds one enum + one table. The encryptedKey column holds
-- AES-256-GCM ciphertext produced by src/lib/encryption.ts; the
-- application layer never returns plaintext after persistence.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApiKeyProvider') THEN
    CREATE TYPE "ApiKeyProvider" AS ENUM (
      'ANTHROPIC',
      'OPENAI',
      'GOOGLE',
      'AZURE_OPENAI',
      'OTHER'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SubOrgApiKey" (
  "id" TEXT NOT NULL,
  "subOrgId" TEXT NOT NULL,
  "provider" "ApiKeyProvider" NOT NULL,
  "label" TEXT NOT NULL,
  "encryptedKey" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubOrgApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubOrgApiKey_subOrgId_provider_label_key"
  ON "SubOrgApiKey"("subOrgId", "provider", "label");

CREATE INDEX IF NOT EXISTS "SubOrgApiKey_subOrgId_provider_idx"
  ON "SubOrgApiKey"("subOrgId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubOrgApiKey_subOrgId_fkey'
  ) THEN
    ALTER TABLE "SubOrgApiKey"
      ADD CONSTRAINT "SubOrgApiKey_subOrgId_fkey"
      FOREIGN KEY ("subOrgId") REFERENCES "OrgRelationship"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
