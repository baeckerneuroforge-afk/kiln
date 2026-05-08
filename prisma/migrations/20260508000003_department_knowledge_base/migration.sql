-- Department <-> KnowledgeBase wiring for RAG-augmented L1/L2 workers.
-- Idempotent guards because production is applied manually via Supabase SQL Editor.

ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "useKnowledgeBase" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "knowledgeBaseId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Department"
    ADD CONSTRAINT "Department_knowledgeBaseId_fkey"
    FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Department_knowledgeBaseId_idx" ON "Department"("knowledgeBaseId");
