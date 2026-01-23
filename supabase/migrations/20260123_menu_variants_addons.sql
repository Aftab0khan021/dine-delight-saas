-- ============================================================
-- Phase 1: Menu Variants & Add-ons
-- Migration: Add support for menu item variants and add-ons
-- ============================================================

-- Menu item variants (e.g., Small, Medium, Large)
CREATE TABLE IF NOT EXISTS public.menu_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT variant_price_nonnegative CHECK (price_cents >= 0),
  CONSTRAINT variant_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS menu_item_variants_menu_item_idx 
ON public.menu_item_variants (restaurant_id, menu_item_id, sort_order);

CREATE INDEX IF NOT EXISTS menu_item_variants_active_idx 
ON public.menu_item_variants (restaurant_id, menu_item_id) WHERE is_active = true;

-- Ensure only one default variant per menu item
CREATE UNIQUE INDEX IF NOT EXISTS menu_item_variants_unique_default 
ON public.menu_item_variants (menu_item_id) WHERE is_default = true;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_menu_item_variants_updated_at ON public.menu_item_variants;
CREATE TRIGGER tr_menu_item_variants_updated_at 
BEFORE UPDATE ON public.menu_item_variants 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_item_variants_select_access" ON public.menu_item_variants;
CREATE POLICY "menu_item_variants_select_access" 
ON public.menu_item_variants FOR SELECT TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "menu_item_variants_write_admin" ON public.menu_item_variants;
CREATE POLICY "menu_item_variants_write_admin" 
ON public.menu_item_variants FOR ALL TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id)) 
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- Menu item add-ons (e.g., Extra Cheese, Toppings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_item_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_mandatory BOOLEAN DEFAULT false,
  max_quantity INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT addon_price_nonnegative CHECK (price_cents >= 0),
  CONSTRAINT addon_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT addon_max_quantity_valid CHECK (max_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS menu_item_addons_menu_item_idx 
ON public.menu_item_addons (restaurant_id, menu_item_id, sort_order);

CREATE INDEX IF NOT EXISTS menu_item_addons_active_idx 
ON public.menu_item_addons (restaurant_id, menu_item_id) WHERE is_active = true;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_menu_item_addons_updated_at ON public.menu_item_addons;
CREATE TRIGGER tr_menu_item_addons_updated_at 
BEFORE UPDATE ON public.menu_item_addons 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies
ALTER TABLE public.menu_item_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_item_addons_select_access" ON public.menu_item_addons;
CREATE POLICY "menu_item_addons_select_access" 
ON public.menu_item_addons FOR SELECT TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "menu_item_addons_write_admin" ON public.menu_item_addons;
CREATE POLICY "menu_item_addons_write_admin" 
ON public.menu_item_addons FOR ALL TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id)) 
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- Update order_items to track selected variants and add-ons
-- ============================================================
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.menu_item_variants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS variant_name TEXT,
ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]';

-- Addons structure: 
-- [
--   {"id": "uuid", "name": "Extra Cheese", "quantity": 2, "price_cents": 50},
--   {"id": "uuid", "name": "Jalapeños", "quantity": 1, "price_cents": 30}
-- ]

CREATE INDEX IF NOT EXISTS order_items_variant_idx 
ON public.order_items (variant_id) WHERE variant_id IS NOT NULL;

COMMENT ON COLUMN public.order_items.variant_id IS 'Reference to selected variant at order time';
COMMENT ON COLUMN public.order_items.variant_name IS 'Snapshot of variant name at order time';
COMMENT ON COLUMN public.order_items.addons IS 'Array of selected add-ons with quantities and prices at order time';

COMMENT ON TABLE public.menu_item_variants IS 'Menu item size variants (Small, Medium, Large, etc.)';
COMMENT ON TABLE public.menu_item_addons IS 'Menu item add-ons and customizations (Extra Cheese, Toppings, etc.)';
