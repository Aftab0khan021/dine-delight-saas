-- Public menu: allow anonymous users to read ACTIVE categories + menu items.
-- This is required for the public /menu route (no auth).

-- Categories: public can read active rows
CREATE POLICY "categories_public_select_active"
ON public.categories
FOR SELECT
USING (is_active = true);

-- Menu items: public can read active rows
CREATE POLICY "menu_items_public_select_active"
ON public.menu_items
FOR SELECT
USING (is_active = true);
