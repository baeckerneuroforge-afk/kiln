-- Phase 2.2 — make match_knowledge_chunks and match_knowledge_chunks_multi
-- org-aware. Both keep their existing signatures backward-compatible by
-- adding the new parameter at the end with a NULL default, so existing
-- callers (legacy retrieval paths) keep working unchanged.
--
-- When target_org_id is provided, results are filtered to chunks belonging
-- to that org OR legacy chunks where org_id IS NULL. When NULL, the
-- function behaves exactly as before — no org filter — which is what
-- service-role callers (server-side ingest, internal cron retrieval) want.

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding text,
  match_agent_id text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  target_org_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  knowledge_base_id text,
  content text,
  chunk_index int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.knowledge_base_id,
    kc.content,
    kc.chunk_index,
    1 - (kc.embedding <=> query_embedding::vector) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.agent_id = match_agent_id
    AND (
      target_org_id IS NULL
      OR kc.org_id = target_org_id
      OR kc.org_id IS NULL
    )
    AND 1 - (kc.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY kc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_knowledge_chunks_multi(
  query_embedding text,
  match_agent_id text,
  match_team_id text DEFAULT NULL,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 8,
  target_org_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  knowledge_base_id text,
  content text,
  chunk_index int,
  similarity float,
  source_type text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.knowledge_base_id,
    kc.content,
    kc.chunk_index,
    -- Agent-specific results get a small relevance boost.
    CASE
      WHEN kc.agent_id = match_agent_id THEN
        (1 - (kc.embedding <=> query_embedding::vector)) * 1.05
      ELSE
        1 - (kc.embedding <=> query_embedding::vector)
    END AS similarity,
    CASE
      WHEN kc.agent_id = match_agent_id THEN 'agent'
      ELSE 'team'
    END AS source_type
  FROM knowledge_chunks kc
  WHERE (
      kc.agent_id = match_agent_id
      OR (
        match_team_id IS NOT NULL
        AND kc.knowledge_base_id IN (
          SELECT id::text FROM "KnowledgeBase"
          WHERE "teamId" = match_team_id
        )
      )
    )
    AND (
      target_org_id IS NULL
      OR kc.org_id = target_org_id
      OR kc.org_id IS NULL
    )
    AND 1 - (kc.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
