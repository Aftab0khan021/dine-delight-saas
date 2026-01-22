-- 1. Add the Soft Delete column
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Update RLS: Public can only see items that are ACTIVE AND NOT DELETED
DROP POLICY IF EXISTS "menu_items_public_select_active" ON public.menu_items;

CREATE POLICY "menu_items_public_select_active"
ON public.menu_items FOR SELECT
USING (is_active = true AND deleted_at IS NULL);

-- 3. Update RLS: Same for Categories
DROP POLICY IF EXISTS "categories_public_select_active" ON public.categories;

CREATE POLICY "categories_public_select_active"
ON public.categories FOR SELECT
USING (is_active = true AND deleted_at IS NULL);