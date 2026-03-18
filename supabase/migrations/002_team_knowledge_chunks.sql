-- Team-Level Knowledge: add team_id column to knowledge_chunks
alter table knowledge_chunks add column if not exists team_id text;

-- Index for team-scoped queries
create index if not exists idx_knowledge_chunks_team_id on knowledge_chunks(team_id);

-- RPC function for team + agent combined semantic search
create or replace function match_knowledge_chunks_multi(
  query_embedding text,
  match_agent_id text,
  match_team_id text default null,
  match_threshold float default 0.7,
  match_count int default 8
)
returns table (
  id uuid,
  knowledge_base_id text,
  content text,
  chunk_index int,
  similarity float,
  source_type text
)
language plpgsql
as $$
begin
  return query
  select
    kc.id,
    kc.knowledge_base_id,
    kc.content,
    kc.chunk_index,
    -- Agent-specific results get a small relevance boost
    case
      when kc.agent_id = match_agent_id then (1 - (kc.embedding <=> query_embedding::vector)) * 1.05
      else 1 - (kc.embedding <=> query_embedding::vector)
    end as similarity,
    case
      when kc.agent_id = match_agent_id then 'agent'
      else 'team'
    end as source_type
  from knowledge_chunks kc
  where (
    kc.agent_id = match_agent_id
    or (match_team_id is not null and kc.team_id = match_team_id)
  )
    and 1 - (kc.embedding <=> query_embedding::vector) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;
