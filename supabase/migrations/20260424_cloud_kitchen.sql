-- ============================================================
-- Cloud Kitchen: multi-brand hierarchy
-- ============================================================

-- Add cloud kitchen fields to restaurants
alter table public.restaurants
  add column if not exists is_cloud_kitchen boolean not null default false,
  add column if not exists parent_kitchen_id uuid references public.restaurants(id) on delete set null,
  add column if not exists brand_color text default '#6366f1',
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

-- Prevent circular parent references
alter table public.restaurants
  drop constraint if exists restaurants_no_self_parent;
alter table public.restaurants
  add constraint restaurants_no_self_parent
  check (parent_kitchen_id is null or parent_kitchen_id != id);

create index if not exists restaurants_parent_kitchen_idx
  on public.restaurants (parent_kitchen_id)
  where parent_kitchen_id is not null;

create index if not exists restaurants_is_cloud_kitchen_idx
  on public.restaurants (is_cloud_kitchen)
  where is_cloud_kitchen = true;

-- ============================================================
-- kitchen_orders_view: unified order view for cloud kitchens
-- ============================================================
drop view if exists public.kitchen_orders_view;
create view public.kitchen_orders_view as
  -- Direct orders for the kitchen
  select
    o.*,
    r.name as brand_name,
    r.brand_color,
    r.parent_kitchen_id,
    r.id as brand_restaurant_id
  from public.orders o
  join public.restaurants r on o.restaurant_id = r.id;
