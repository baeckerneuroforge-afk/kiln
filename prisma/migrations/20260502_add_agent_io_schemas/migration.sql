-- AlterTable: Add input/output schema fields to Agent
ALTER TABLE "Agent"
  ADD COLUMN "inputSchema" JSONB,
  ADD COLUMN "outputSchema" JSONB,
  ADD COLUMN "strictOutputValidation" BOOLEAN NOT NULL DEFAULT false;
