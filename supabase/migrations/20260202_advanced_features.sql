-- ============================================================
-- Advanced WhatsApp Features - Database Schema
-- Migration: Add variants, addons, allergens, and customer profile fields
-- ============================================================

-- ============================================================
-- 1. MENU ENHANCEMENTS
-- ============================================================

-- Add allergens to menu_items
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS allergens TEXT[] DEFAULT '{}';

-- Create Variants Table
CREATE TABLE IF NOT EXISTS public.menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "Small", "Medium", "Large"
    price_adjustment_cents INTEGER DEFAULT 0, -- Extra cost or different price
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item 
ON public.menu_item_variants(menu_item_id);

-- Create Add-ons Table
CREATE TABLE IF NOT EXISTS public.menu_item_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "Extra Cheese"
    price_cents INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_addons_item 
ON public.menu_item_addons(menu_item_id);

-- ============================================================
-- 2. ORDER CUSTOMIZATION
-- ============================================================

-- Update order_items to store customization
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS variant_name TEXT,
ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]', -- List of {name, price}
ADD COLUMN IF NOT EXISTS special_instructions TEXT;

-- Update orders for tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS estimated_completion_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_tracking_url TEXT;

-- ============================================================
-- 3. CUSTOMER PROFILE
-- ============================================================

-- Update whatsapp_customers for preferences
ALTER TABLE public.whatsapp_customers
ADD COLUMN IF NOT EXISTS saved_addresses JSONB DEFAULT '[]', -- List of {label, address}
ADD COLUMN IF NOT EXISTS favorite_item_ids UUID[] DEFAULT '{}';

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

-- Variants
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_item_variants_select" 
ON public.menu_item_variants FOR SELECT 
USING (true); -- Publicly viewable for menu

CREATE POLICY "menu_item_variants_write" 
ON public.menu_item_variants FOR ALL 
USING (public.has_restaurant_access(auth.uid(), (SELECT restaurant_id FROM menu_items WHERE id = menu_item_id)));

-- Add-ons
ALTER TABLE public.menu_item_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_item_addons_select" 
ON public.menu_item_addons FOR SELECT 
USING (true);

CREATE POLICY "menu_item_addons_write" 
ON public.menu_item_addons FOR ALL 
USING (public.has_restaurant_access(auth.uid(), (SELECT restaurant_id FROM menu_items WHERE id = menu_item_id)));

-- ============================================================
-- 5. FUNCTION UPDATES
-- ============================================================

-- Function to save a delivery address
CREATE OR REPLACE FUNCTION save_customer_address(
    p_customer_id UUID,
    p_address TEXT,
    p_label TEXT DEFAULT 'Home'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_addresses JSONB;
BEGIN
    SELECT saved_addresses INTO v_addresses
    FROM public.whatsapp_customers
    WHERE id = p_customer_id;

    -- Append new address (simplified logic: just add to array)
    -- Ideally checks for duplicates, but for MVP we just append
    IF v_addresses IS NULL THEN 
        v_addresses := '[]'::JSONB; 
    END IF;

    UPDATE public.whatsapp_customers
    SET saved_addresses = v_addresses || jsonb_build_object('label', p_label, 'address', p_address)
    WHERE id = p_customer_id;
END;
$$;
