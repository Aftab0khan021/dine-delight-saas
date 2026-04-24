-- ============================================================
-- Menu Intelligence: tags, popularity tracking, upsell pairs
-- ============================================================

-- Add tags to menu items (e.g., ['hot', 'comfort', 'light', 'spicy', 'quick'])
alter table public.menu_items
  add column if not exists tags text[] not null default '{}';

create index if not exists menu_items_tags_idx
  on public.menu_items using gin(tags);

-- ============================================================
-- order_item_co_occurrences: tracks "people also ordered" pairs
-- Uses a simple incrementing count per pair, maintained by trigger
-- ============================================================
create table if not exists public.order_item_pairs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_a_id uuid not null references public.menu_items(id) on delete cascade,
  item_b_id uuid not null references public.menu_items(id) on delete cascade,
  co_order_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  constraint item_pairs_different check (item_a_id != item_b_id),
  -- Always store with item_a_id < item_b_id to avoid duplicates
  constraint item_pairs_ordered check (item_a_id < item_b_id)
);

create unique index if not exists order_item_pairs_unique_pair
  on public.order_item_pairs (restaurant_id, item_a_id, item_b_id);

create index if not exists order_item_pairs_item_a_idx
  on public.order_item_pairs (restaurant_id, item_a_id, co_order_count desc);

create index if not exists order_item_pairs_item_b_idx
  on public.order_item_pairs (restaurant_id, item_b_id, co_order_count desc);

alter table public.order_item_pairs enable row level security;

drop policy if exists "order_item_pairs_select" on public.order_item_pairs;
create policy "order_item_pairs_select" on public.order_item_pairs
  for select using (true); -- Public so menu page can call it

drop policy if exists "order_item_pairs_admin" on public.order_item_pairs;
create policy "order_item_pairs_admin" on public.order_item_pairs
  for all to authenticated
  using (public.has_restaurant_access(auth.uid(), restaurant_id))
  with check (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- Function: update_order_item_pairs
-- Called after each order is completed to update co-occurrence counts
-- ============================================================
create or replace function public.update_order_item_pairs()
returns trigger language plpgsql security definer as $$
declare
  item_ids uuid[];
  i integer;
  j integer;
  a_id uuid;
  b_id uuid;
begin
  -- Get all menu_item_ids for this order
  select array_agg(distinct menu_item_id) into item_ids
  from public.order_items
  where order_id = new.id and menu_item_id is not null;

  if array_length(item_ids, 1) < 2 then
    return new;
  end if;

  -- Upsert all pairs
  for i in 1..array_length(item_ids, 1) loop
    for j in (i+1)..array_length(item_ids, 1) loop
      -- Ensure consistent ordering
      if item_ids[i] < item_ids[j] then
        a_id := item_ids[i]; b_id := item_ids[j];
      else
        a_id := item_ids[j]; b_id := item_ids[i];
      end if;

      insert into public.order_item_pairs
        (restaurant_id, item_a_id, item_b_id, co_order_count, last_seen_at)
      values
        (new.restaurant_id, a_id, b_id, 1, now())
      on conflict (restaurant_id, item_a_id, item_b_id)
      do update set
        co_order_count = order_item_pairs.co_order_count + 1,
        last_seen_at = now();
    end loop;
  end loop;

  return new;
end;
$$;

-- Fire when an order's status changes to 'completed'
drop trigger if exists tr_update_item_pairs_on_complete on public.orders;
create trigger tr_update_item_pairs_on_complete
  after update on public.orders
  for each row
  when (new.status = 'completed' and old.status != 'completed')
  execute function public.update_order_item_pairs();

-- ============================================================
-- menu_item_popularity: daily roll-up view for ranking
-- ============================================================
drop view if exists public.menu_item_popularity;
create view public.menu_item_popularity as
select
  oi.restaurant_id,
  oi.menu_item_id,
  count(*) as order_count_7d,
  sum(oi.quantity) as total_qty_7d,
  sum(oi.line_total_cents) as revenue_cents_7d,
  max(o.placed_at) as last_ordered_at
from public.order_items oi
join public.orders o on oi.order_id = o.id
where o.placed_at >= now() - interval '7 days'
  and o.status not in ('cancelled', 'refunded')
group by oi.restaurant_id, oi.menu_item_id;
