ALTER TABLE "AgentVersion" RENAME COLUMN "versionNumber" TO "version";
ALTER TABLE "AgentVersion" RENAME COLUMN "configSnapshot" TO "config";
ALTER TABLE "AgentVersion" RENAME COLUMN "note" TO "changelog";

UPDATE "AgentVersion"
SET "changelog" = COALESCE(NULLIF("changelog", ''), 'Version snapshot');

ALTER TABLE "AgentVersion"
ALTER COLUMN "changelog" SET NOT NULL;

ALTER TABLE "AgentVersion"
ADD COLUMN "createdBy" TEXT;

UPDATE "AgentVersion" AS version
SET "createdBy" = agent."userId"
FROM "Agent" AS agent
WHERE version."agentId" = agent."id";

ALTER TABLE "AgentVersion"
ALTER COLUMN "createdBy" SET NOT NULL;

DROP INDEX IF EXISTS "AgentVersion_agentId_versionNumber_key";

CREATE UNIQUE INDEX "AgentVersion_agentId_version_key"
ON "AgentVersion"("agentId", "version");
