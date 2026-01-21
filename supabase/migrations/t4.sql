create policy "Admins can view restaurant profiles"
on public.profiles
for select
using (
  exists (
    select 1
    from user_roles ur
    where ur.user_id = profiles.id
      and has_restaurant_access(auth.uid(), ur.restaurant_id)
  )
);
