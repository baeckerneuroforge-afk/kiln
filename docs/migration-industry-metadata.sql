-- Idempotent production migration for Sprint 7 industry-pack metadata.
ALTER TABLE "IndustryTemplate"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;
