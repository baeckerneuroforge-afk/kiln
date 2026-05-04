-- Phase 2.2 — Multi-Tenancy RLS for knowledge_chunks
--
-- Adds an org_id column to knowledge_chunks (denormalised from KnowledgeBase
-- for fast index-only filtering during pgvector matches) and enforces
-- org-scoped RLS so direct Supabase clients cannot read chunks from other
-- orgs even if they hold a valid Clerk JWT.
--
-- The Clerk JWT must include `org_id` as a custom claim. See
-- MIGRATION_NOTES.md for the dashboard configuration.

-- Add org_id column (nullable so legacy rows still work).
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS org_id text;

-- Index for the per-org filter scan.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org_id
  ON knowledge_chunks(org_id);

-- Enable RLS (idempotent — already enabled in 001_knowledge_chunks.sql,
-- this is a no-op on top of the existing setting but documents intent).
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Drop the existing wide-open policy so we can replace it with scoped ones.
DROP POLICY IF EXISTS "Service role full access" ON knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_org_select" ON knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_org_insert" ON knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_org_update" ON knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_org_delete" ON knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_service_role" ON knowledge_chunks;

-- Service-role bypass: server-side code (Prisma + the supabase admin client)
-- needs full access for ingest, embedding, and matching RPCs.
CREATE POLICY "kb_chunks_service_role" ON knowledge_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated user policy: only chunks whose org_id matches the caller's
-- active Clerk org claim, OR legacy chunks (org_id IS NULL) on a knowledge
-- base that the user owns. The legacy branch is the same backward-compat
-- pattern used by the API route filters.
CREATE POLICY "kb_chunks_org_select" ON knowledge_chunks
  FOR SELECT
  TO authenticated
  USING (
    -- Active org match (typical case).
    org_id = (auth.jwt() ->> 'org_id')
    OR
    -- Legacy fallback: chunk has no org_id yet, but its parent KnowledgeBase
    -- has an Agent owned by this user.
    (
      org_id IS NULL
      AND knowledge_base_id IN (
        SELECT kb.id::text
        FROM "KnowledgeBase" kb
        JOIN "Agent" a ON a.id = kb."agentId"
        WHERE a."userId" = auth.uid()::text
      )
    )
  );

CREATE POLICY "kb_chunks_org_insert" ON knowledge_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')
  );

CREATE POLICY "kb_chunks_org_update" ON knowledge_chunks
  FOR UPDATE
  TO authenticated
  USING (org_id = (auth.jwt() ->> 'org_id'))
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id'));

CREATE POLICY "kb_chunks_org_delete" ON knowledge_chunks
  FOR DELETE
  TO authenticated
  USING (org_id = (auth.jwt() ->> 'org_id'));
