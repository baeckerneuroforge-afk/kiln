-- Add fallback runtime fields for team members
ALTER TABLE "AgentTeamMember"
ADD COLUMN "fallbackAgentId" TEXT,
ADD COLUMN "fallbackModel" TEXT,
ADD COLUMN "fallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 2;

CREATE INDEX "AgentTeamMember_fallbackAgentId_idx" ON "AgentTeamMember"("fallbackAgentId");

ALTER TABLE "AgentTeamMember"
ADD CONSTRAINT "AgentTeamMember_fallbackAgentId_fkey"
FOREIGN KEY ("fallbackAgentId") REFERENCES "Agent"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
