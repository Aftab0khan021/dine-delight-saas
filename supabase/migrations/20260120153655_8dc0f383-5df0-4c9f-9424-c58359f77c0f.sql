-- ============================================================
-- Add missing multi-tenant Restaurant SaaS tables (FIXED)
-- Uses correct existing app_role enum values
-- ============================================================

create extension if not exists pgcrypto;

-- -------------------------
-- Enums (create if missing)
-- -------------------------
do $$ begin
  create type public.order_status as enum (
    'draft','pending','accepted','in_progress','ready','completed','cancelled','refunded'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- categories
-- ============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists categories_unique_name_per_restaurant on public.categories (restaurant_id, lower(name));
create index if not exists categories_restaurant_sort_idx on public.categories (restaurant_id, sort_order, created_at desc);

drop trigger if exists tr_categories_updated_at on public.categories;
create trigger tr_categories_updated_at before update on public.categories for each row execute function public.update_updated_at_column();

alter table public.categories enable row level security;

drop policy if exists "categories_select_access" on public.categories;
create policy "categories_select_access" on public.categories for select to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin" on public.categories for all to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id)) with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- menu_items
-- ============================================================
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price_cents integer not null,
  currency_code char(3) not null default 'USD',
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  sku text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_items_price_nonnegative check (price_cents >= 0),
  constraint menu_items_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint menu_items_name_nonempty check (length(trim(name)) > 0)
);

create index if not exists menu_items_restaurant_idx on public.menu_items (restaurant_id, is_active, sort_order, created_at desc);
create index if not exists menu_items_category_idx on public.menu_items (restaurant_id, category_id);
create unique index if not exists menu_items_unique_sku_per_restaurant on public.menu_items (restaurant_id, lower(sku)) where sku is not null and length(trim(sku)) > 0;

drop trigger if exists tr_menu_items_updated_at on public.menu_items;
create trigger tr_menu_items_updated_at before update on public.menu_items for each row execute function public.update_updated_at_column();

alter table public.menu_items enable row level security;

drop policy if exists "menu_items_select_access" on public.menu_items;
create policy "menu_items_select_access" on public.menu_items for select to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "menu_items_write_admin" on public.menu_items;
create policy "menu_items_write_admin" on public.menu_items for all to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id)) with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- orders
-- ============================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  status public.order_status not null default 'pending',
  table_label text,
  notes text,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  tip_cents integer not null default 0,
  total_cents integer not null default 0,
  currency_code char(3) not null default 'USD',
  placed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_money_nonnegative check (subtotal_cents >= 0 and tax_cents >= 0 and tip_cents >= 0 and total_cents >= 0),
  constraint orders_currency_format check (currency_code ~ '^[A-Z]{3}$')
);

create index if not exists orders_restaurant_status_idx on public.orders (restaurant_id, status, placed_at desc);
create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index if not exists orders_customer_idx on public.orders (restaurant_id, customer_id, created_at desc);

drop trigger if exists tr_orders_updated_at on public.orders;
create trigger tr_orders_updated_at before update on public.orders for each row execute function public.update_updated_at_column();

alter table public.orders enable row level security;

drop policy if exists "orders_select_access" on public.orders;
create policy "orders_select_access" on public.orders for select to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "orders_insert_access" on public.orders;
create policy "orders_insert_access" on public.orders for insert to authenticated with check (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "orders_update_access" on public.orders;
create policy "orders_update_access" on public.orders for update to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id)) with check (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin" on public.orders for delete to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- order_items
-- ============================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  quantity integer not null default 1,
  unit_price_cents integer not null,
  line_total_cents integer not null,
  name_snapshot text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_items_qty_positive check (quantity > 0),
  constraint order_items_money_nonnegative check (unit_price_cents >= 0 and line_total_cents >= 0)
);

create index if not exists order_items_order_idx on public.order_items (restaurant_id, order_id);
create index if not exists order_items_menu_item_idx on public.order_items (restaurant_id, menu_item_id);

drop trigger if exists tr_order_items_updated_at on public.order_items;
create trigger tr_order_items_updated_at before update on public.order_items for each row execute function public.update_updated_at_column();

alter table public.order_items enable row level security;

drop policy if exists "order_items_select_access" on public.order_items;
create policy "order_items_select_access" on public.order_items for select to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "order_items_write_access" on public.order_items;
create policy "order_items_write_access" on public.order_items for all to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id)) with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- staff_invites (using 'user' role from existing enum as default)
-- ============================================================
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'user',
  status public.invite_status not null default 'pending',
  token_hash text not null,
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_invites_role_allowed check (role in ('restaurant_admin','user'))
);

create index if not exists staff_invites_restaurant_status_idx on public.staff_invites (restaurant_id, status, created_at desc);
create unique index if not exists staff_invites_unique_active_email on public.staff_invites (restaurant_id, lower(email)) where status = 'pending';
create unique index if not exists staff_invites_token_hash_key on public.staff_invites (token_hash);

drop trigger if exists tr_staff_invites_updated_at on public.staff_invites;
create trigger tr_staff_invites_updated_at before update on public.staff_invites for each row execute function public.update_updated_at_column();

alter table public.staff_invites enable row level security;

drop policy if exists "staff_invites_select_admin" on public.staff_invites;
create policy "staff_invites_select_admin" on public.staff_invites for select to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "staff_invites_write_admin" on public.staff_invites;
create policy "staff_invites_write_admin" on public.staff_invites for all to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id)) with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- qr_codes
-- ============================================================
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null,
  table_label text,
  destination_path text not null,
  is_active boolean not null default true,
  last_scanned_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_codes_code_nonempty check (length(trim(code)) > 0),
  constraint qr_codes_destination_nonempty check (length(trim(destination_path)) > 0)
);

create unique index if not exists qr_codes_unique_code_per_restaurant on public.qr_codes (restaurant_id, code);
create index if not exists qr_codes_restaurant_active_idx on public.qr_codes (restaurant_id, is_active, created_at desc);

drop trigger if exists tr_qr_codes_updated_at on public.qr_codes;
create trigger tr_qr_codes_updated_at before update on public.qr_codes for each row execute function public.update_updated_at_column();

alter table public.qr_codes enable row level security;

drop policy if exists "qr_codes_select_access" on public.qr_codes;
create policy "qr_codes_select_access" on public.qr_codes for select to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "qr_codes_write_admin" on public.qr_codes;
create policy "qr_codes_write_admin" on public.qr_codes for all to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id)) with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- subscriptions
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  status public.subscription_status not null,
  plan_key text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_nonempty check (length(trim(provider)) > 0),
  constraint subscriptions_plan_nonempty check (length(trim(plan_key)) > 0)
);

create unique index if not exists subscriptions_provider_id_key on public.subscriptions (provider, provider_subscription_id);
create index if not exists subscriptions_restaurant_status_idx on public.subscriptions (restaurant_id, status, created_at desc);

drop trigger if exists tr_subscriptions_updated_at on public.subscriptions;
create trigger tr_subscriptions_updated_at before update on public.subscriptions for each row execute function public.update_updated_at_column();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_restaurant_admin" on public.subscriptions;
create policy "subscriptions_select_restaurant_admin" on public.subscriptions for select to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "subscriptions_manage_super_admin" on public.subscriptions;
create policy "subscriptions_manage_super_admin" on public.subscriptions for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'::public.app_role)) with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- invoices
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  provider_invoice_id text not null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  status public.invoice_status not null default 'open',
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  currency_code char(3) not null default 'USD',
  due_at timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_money_nonnegative check (amount_due_cents >= 0 and amount_paid_cents >= 0),
  constraint invoices_currency_format check (currency_code ~ '^[A-Z]{3}$')
);

create unique index if not exists invoices_provider_id_key on public.invoices (provider, provider_invoice_id);
create index if not exists invoices_restaurant_status_idx on public.invoices (restaurant_id, status, created_at desc);
create index if not exists invoices_subscription_idx on public.invoices (restaurant_id, subscription_id, created_at desc);

drop trigger if exists tr_invoices_updated_at on public.invoices;
create trigger tr_invoices_updated_at before update on public.invoices for each row execute function public.update_updated_at_column();

alter table public.invoices enable row level security;

drop policy if exists "invoices_select_restaurant_admin" on public.invoices;
create policy "invoices_select_restaurant_admin" on public.invoices for select to authenticated
using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "invoices_manage_super_admin" on public.invoices;
create policy "invoices_manage_super_admin" on public.invoices for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'::public.app_role)) with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- activity_logs
-- ============================================================
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_logs_action_nonempty check (length(trim(action)) > 0),
  constraint activity_logs_entity_type_nonempty check (length(trim(entity_type)) > 0)
);

create index if not exists activity_logs_restaurant_created_idx on public.activity_logs (restaurant_id, created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (restaurant_id, entity_type, entity_id, created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs (restaurant_id, actor_user_id, created_at desc);

drop trigger if exists tr_activity_logs_updated_at on public.activity_logs;
create trigger tr_activity_logs_updated_at before update on public.activity_logs for each row execute function public.update_updated_at_column();

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_access" on public.activity_logs;
create policy "activity_logs_select_access" on public.activity_logs for select to authenticated using (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "activity_logs_insert_access" on public.activity_logs;
create policy "activity_logs_insert_access" on public.activity_logs for insert to authenticated with check (public.has_restaurant_access(auth.uid(), restaurant_id));

drop policy if exists "activity_logs_delete_super_admin" on public.activity_logs;
create policy "activity_logs_delete_super_admin" on public.activity_logs for delete to authenticated using (public.has_role(auth.uid(), 'super_admin'::public.app_role));