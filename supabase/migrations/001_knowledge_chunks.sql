-- pgvector Extension aktivieren
create extension if not exists vector;

-- Knowledge Chunks Tabelle mit Vektor-Embedding
create table if not exists knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  knowledge_base_id text not null,
  agent_id text not null,
  content text not null,
  embedding vector(1536), -- OpenAI ada-002 hat 1536 Dimensionen
  chunk_index int not null default 0,
  created_at timestamptz default now()
);

-- Indices für schnelle Suche
create index if not exists idx_knowledge_chunks_agent_id on knowledge_chunks(agent_id);
create index if not exists idx_knowledge_chunks_kb_id on knowledge_chunks(knowledge_base_id);

-- IVFFlat Index für Vektor-Suche (performant ab ~1000 Chunks)
create index if not exists idx_knowledge_chunks_embedding on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC Funktion für Semantic Search
create or replace function match_knowledge_chunks(
  query_embedding text,
  match_agent_id text,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  knowledge_base_id text,
  content text,
  chunk_index int,
  similarity float
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
    1 - (kc.embedding <=> query_embedding::vector) as similarity
  from knowledge_chunks kc
  where kc.agent_id = match_agent_id
    and 1 - (kc.embedding <=> query_embedding::vector) > match_threshold
  order by kc.embedding <=> query_embedding::vector
  limit match_count;
end;
$$;

-- RLS aktivieren
alter table knowledge_chunks enable row level security;

-- Policy: Service Role kann alles
create policy "Service role full access" on knowledge_chunks
  for all using (true) with check (true);
