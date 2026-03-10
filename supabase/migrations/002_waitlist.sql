-- Waitlist Tabelle
create table if not exists waitlist (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  created_at timestamptz default now()
);

-- RLS
alter table waitlist enable row level security;

-- Service Role kann alles
create policy "Service role full access" on waitlist
  for all using (true) with check (true);
