-- ============================================================
-- WhatsApp CRM: customer contact fields + campaign tracking
-- ============================================================

-- Add customer contact to orders
alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists customer_name text;

-- Constrain phone format loosely (allow international)
alter table public.orders
  drop constraint if exists orders_phone_format;
alter table public.orders
  add constraint orders_phone_format
  check (customer_phone is null or customer_phone ~ '^\+?[0-9\s\-]{7,20}$');

create index if not exists orders_customer_phone_idx
  on public.orders (restaurant_id, customer_phone)
  where customer_phone is not null;

-- ============================================================
-- whatsapp_campaigns: tracks every message sent
-- ============================================================
create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  phone text not null,
  customer_name text,
  type text not null default 'receipt', -- 'receipt' | 'reengagement' | 'custom'
  status text not null default 'queued', -- 'queued' | 'sent' | 'failed' | 'delivered'
  message_id text, -- WhatsApp message ID from API response
  coupon_code text, -- if reengagement coupon was sent
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_campaigns_type_valid check (type in ('receipt', 'reengagement', 'custom')),
  constraint whatsapp_campaigns_status_valid check (status in ('queued', 'sent', 'failed', 'delivered'))
);

create index if not exists whatsapp_campaigns_restaurant_idx
  on public.whatsapp_campaigns (restaurant_id, created_at desc);
create index if not exists whatsapp_campaigns_order_idx
  on public.whatsapp_campaigns (order_id) where order_id is not null;
create index if not exists whatsapp_campaigns_phone_idx
  on public.whatsapp_campaigns (restaurant_id, phone);

drop trigger if exists tr_whatsapp_campaigns_updated_at on public.whatsapp_campaigns;
create trigger tr_whatsapp_campaigns_updated_at
  before update on public.whatsapp_campaigns
  for each row execute function public.update_updated_at_column();

alter table public.whatsapp_campaigns enable row level security;

drop policy if exists "whatsapp_campaigns_select_admin" on public.whatsapp_campaigns;
create policy "whatsapp_campaigns_select_admin" on public.whatsapp_campaigns
  for select to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "whatsapp_campaigns_write_service" on public.whatsapp_campaigns;
create policy "whatsapp_campaigns_write_service" on public.whatsapp_campaigns
  for all to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id))
  with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- Allow anon insert for edge function (service role bypasses RLS anyway)
drop policy if exists "whatsapp_campaigns_anon_insert" on public.whatsapp_campaigns;
