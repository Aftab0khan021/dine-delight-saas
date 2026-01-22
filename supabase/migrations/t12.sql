drop policy "Public can view restaurants" on public.restaurants;

create policy "Public can view active restaurants"
on public.restaurants
for select
using (is_active = true);
