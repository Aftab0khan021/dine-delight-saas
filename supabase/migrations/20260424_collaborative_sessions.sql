-- ============================================================
-- Collaborative Sessions: real-time shared cart state
-- ============================================================

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_label text not null,
  session_key text not null,        -- Unique key for the Realtime channel
  cart_state jsonb not null default '{"items":[]}'::jsonb,
  leader_token text not null,       -- UUID of the session creator's device token
  participant_count integer not null default 1,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  constraint table_sessions_table_nonempty check (length(trim(table_label)) > 0)
);

create unique index if not exists table_sessions_session_key_key
  on public.table_sessions (session_key);

create index if not exists table_sessions_restaurant_table_idx
  on public.table_sessions (restaurant_id, table_label, expires_at)
  where expires_at > now();

create index if not exists table_sessions_expires_idx
  on public.table_sessions (expires_at);

drop trigger if exists tr_table_sessions_updated_at on public.table_sessions;

alter table public.table_sessions enable row level security;

-- Fully public: any device with the session_key can read/write
-- Security is via the unguessable session_key UUID
drop policy if exists "table_sessions_public_read" on public.table_sessions;
create policy "table_sessions_public_read" on public.table_sessions
  for select using (expires_at > now());

drop policy if exists "table_sessions_public_insert" on public.table_sessions;
create policy "table_sessions_public_insert" on public.table_sessions
  for insert with check (true);

drop policy if exists "table_sessions_public_update" on public.table_sessions;
create policy "table_sessions_public_update" on public.table_sessions
  for update using (expires_at > now());

-- RPC: get or create table session
create or replace function public.get_or_create_table_session(
  p_restaurant_id uuid,
  p_table_label text,
  p_leader_token text
)
returns public.table_sessions
language plpgsql security definer as $$
declare
  v_session public.table_sessions;
  v_session_key text;
begin
  -- Try to find an active session for this table
  select * into v_session
  from public.table_sessions
  where restaurant_id = p_restaurant_id
    and table_label = p_table_label
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    -- Update participant count and activity
    update public.table_sessions
    set participant_count = participant_count + 1,
        last_activity_at = now()
    where id = v_session.id
    returning * into v_session;
    return v_session;
  end if;

  -- Create new session
  v_session_key := gen_random_uuid()::text;

  insert into public.table_sessions
    (restaurant_id, table_label, session_key, leader_token)
  values
    (p_restaurant_id, p_table_label, v_session_key, p_leader_token)
  returning * into v_session;

  return v_session;
end;
$$;
