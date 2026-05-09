-- Adds a flexible metadata bag for industry-specific channel and workflow
-- configuration such as WhatsApp templates, voice scripts, and recall logic.
ALTER TABLE "IndustryTemplate"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;
