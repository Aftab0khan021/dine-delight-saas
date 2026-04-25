-- ============================================================
-- Order Type Selection - Database Schema Updates
-- Migration: Add order type selection and table number support
-- ============================================================

-- ============================================================
-- 1. ADD TABLE NUMBER TO ORDERS
-- ============================================================
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS table_number TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_table_number 
ON public.orders(restaurant_id, table_number) 
WHERE table_number IS NOT NULL;

COMMENT ON COLUMN public.orders.table_number IS 'Table number for dine-in orders';

-- ============================================================
-- 2. UPDATE CONVERSATION STATE CONSTRAINT
-- ============================================================
ALTER TABLE public.whatsapp_conversations 
DROP CONSTRAINT IF EXISTS valid_state;

ALTER TABLE public.whatsapp_conversations
ADD CONSTRAINT valid_state CHECK (
  state IN (
    'greeting',
    'selecting_order_type',
    'entering_table_number',
    'browsing_menu',
    'viewing_category',
    'viewing_item',
    'selecting_quantity',
    'reviewing_cart',
    'confirming_order',
    'checkout_address',
    'order_placed',
    'tracking_order',
    'support',
    'ended'
  )
);

COMMENT ON CONSTRAINT valid_state ON public.whatsapp_conversations IS 'Valid conversation states including order type selection';
