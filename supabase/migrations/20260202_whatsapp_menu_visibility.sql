-- ============================================================
-- WhatsApp Menu Visibility Control
-- Migration: Add show_in_whatsapp flag to menu_items and categories
-- ============================================================

-- Add show_in_whatsapp column to categories
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS show_in_whatsapp BOOLEAN NOT NULL DEFAULT true;

-- Add show_in_whatsapp column to menu_items
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS show_in_whatsapp BOOLEAN NOT NULL DEFAULT true;

-- Add indexes for WhatsApp queries
CREATE INDEX IF NOT EXISTS idx_categories_whatsapp 
ON public.categories(restaurant_id, show_in_whatsapp, is_active) 
WHERE show_in_whatsapp = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_menu_items_whatsapp 
ON public.menu_items(restaurant_id, category_id, show_in_whatsapp, is_active) 
WHERE show_in_whatsapp = true AND is_active = true;

-- Add comments
COMMENT ON COLUMN public.categories.show_in_whatsapp IS 'Whether this category should be visible in WhatsApp bot menu';
COMMENT ON COLUMN public.menu_items.show_in_whatsapp IS 'Whether this menu item should be visible in WhatsApp bot menu';
