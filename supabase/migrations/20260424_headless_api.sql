-- ============================================================
-- Headless API: API keys + webhook infrastructure
-- ============================================================

-- ============================================================
-- api_keys
-- ============================================================
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  key_prefix text not null,   -- First 8 chars of key for display (e.g., "dd_live_")
  key_hash text not null,     -- SHA-256 hash of the full key
  scopes text[] not null default '{"menu:read", "orders:write", "orders:read"}',
  last_used_at timestamptz,
  is_active boolean not null default true,
  expires_at timestamptz,     -- null = never expires
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_keys_name_nonempty check (length(trim(name)) > 0),
  constraint api_keys_prefix_nonempty check (length(key_prefix) >= 8)
);

create unique index if not exists api_keys_hash_key on public.api_keys (key_hash);
create index if not exists api_keys_restaurant_idx on public.api_keys (restaurant_id, is_active, created_at desc);

drop trigger if exists tr_api_keys_updated_at on public.api_keys;
create trigger tr_api_keys_updated_at
  before update on public.api_keys
  for each row execute function public.update_updated_at_column();

alter table public.api_keys enable row level security;

drop policy if exists "api_keys_select_admin" on public.api_keys;
create policy "api_keys_select_admin" on public.api_keys
  for select to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "api_keys_write_admin" on public.api_keys;
create policy "api_keys_write_admin" on public.api_keys
  for all to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id))
  with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- webhook_endpoints
-- ============================================================
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  url text not null,
  events text[] not null default '{"order.placed", "order.status_changed"}',
  secret_hash text not null,  -- HMAC signing secret hash (SHA-256)
  secret_prefix text not null, -- First 8 chars for display
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_endpoints_url_nonempty check (length(trim(url)) > 0),
  constraint webhook_endpoints_url_https check (url like 'https://%')
);

create index if not exists webhook_endpoints_restaurant_idx
  on public.webhook_endpoints (restaurant_id, is_active);

drop trigger if exists tr_webhook_endpoints_updated_at on public.webhook_endpoints;
create trigger tr_webhook_endpoints_updated_at
  before update on public.webhook_endpoints
  for each row execute function public.update_updated_at_column();

alter table public.webhook_endpoints enable row level security;

drop policy if exists "webhook_endpoints_admin" on public.webhook_endpoints;
create policy "webhook_endpoints_admin" on public.webhook_endpoints
  for all to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id))
  with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- webhook_deliveries
-- ============================================================
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending', -- 'pending' | 'success' | 'failed'
  http_status integer,
  response_body text,
  attempts integer not null default 0,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webhook_deliveries_status_valid
    check (status in ('pending', 'success', 'failed'))
);

create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries (endpoint_id, created_at desc);
create index if not exists webhook_deliveries_restaurant_idx
  on public.webhook_deliveries (restaurant_id, created_at desc);

alter table public.webhook_deliveries enable row level security;

drop policy if exists "webhook_deliveries_admin" on public.webhook_deliveries;
create policy "webhook_deliveries_admin" on public.webhook_deliveries
  for select to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id));
