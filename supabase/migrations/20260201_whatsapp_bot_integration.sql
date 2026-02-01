-- ============================================================
-- WhatsApp Bot Integration - Database Schema
-- Migration: Add WhatsApp conversation and messaging tables
-- ============================================================

-- ============================================================
-- 1. WHATSAPP CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT,
  language TEXT DEFAULT 'en',
  preferences JSONB DEFAULT '{}',
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT phone_number_format CHECK (phone_number ~ '^\+[1-9]\d{1,14}$')
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_customers_phone 
ON public.whatsapp_customers(phone_number);

CREATE INDEX IF NOT EXISTS idx_whatsapp_customers_restaurant 
ON public.whatsapp_customers(restaurant_id);

-- ============================================================
-- 2. WHATSAPP CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  whatsapp_customer_id UUID NOT NULL REFERENCES public.whatsapp_customers(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'greeting',
  context JSONB DEFAULT '{}',
  cart JSONB DEFAULT '{"items": [], "total": 0}',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_state CHECK (
    state IN (
      'greeting',
      'browsing_menu',
      'viewing_category',
      'viewing_item',
      'adding_to_cart',
      'reviewing_cart',
      'checkout_address',
      'checkout_payment',
      'order_placed',
      'tracking_order',
      'support',
      'ended'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_restaurant 
ON public.whatsapp_conversations(restaurant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_customer 
ON public.whatsapp_conversations(whatsapp_customer_id, is_active);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_state 
ON public.whatsapp_conversations(state) WHERE is_active = true;

-- ============================================================
-- 3. WHATSAPP MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT valid_message_type CHECK (
    message_type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'button', 'list', 'template')
  ),
  CONSTRAINT valid_status CHECK (status IN ('sent', 'delivered', 'read', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation 
ON public.whatsapp_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_whatsapp_id 
ON public.whatsapp_messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- ============================================================
-- 4. WHATSAPP ORDERS (Link WhatsApp conversations to orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_orders_conversation 
ON public.whatsapp_orders(conversation_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_orders_order 
ON public.whatsapp_orders(order_id);

-- ============================================================
-- 5. MODIFY EXISTING TABLES
-- ============================================================

-- Add source field to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web' 
CHECK (source IN ('web', 'qr', 'whatsapp', 'admin'));

CREATE INDEX IF NOT EXISTS idx_orders_source 
ON public.orders(source);

-- Add WhatsApp configuration to restaurants
ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS whatsapp_config JSONB DEFAULT '{
  "enabled": false,
  "phone_number": null,
  "business_account_id": null,
  "access_token": null,
  "webhook_verify_token": null,
  "auto_reply_enabled": true,
  "greeting_message": "Welcome! How can I help you today?",
  "working_hours": {
    "enabled": false,
    "message": "We are currently closed. Our working hours are 9 AM - 10 PM."
  }
}';

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_whatsapp_customers_updated_at ON public.whatsapp_customers;
CREATE TRIGGER trigger_whatsapp_customers_updated_at
BEFORE UPDATE ON public.whatsapp_customers
FOR EACH ROW
EXECUTE FUNCTION update_whatsapp_timestamp();

DROP TRIGGER IF EXISTS trigger_whatsapp_conversations_updated_at ON public.whatsapp_conversations;
CREATE TRIGGER trigger_whatsapp_conversations_updated_at
BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW
EXECUTE FUNCTION update_whatsapp_timestamp();

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.whatsapp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_orders ENABLE ROW LEVEL SECURITY;

-- WhatsApp customers policies
DROP POLICY IF EXISTS "whatsapp_customers_select" ON public.whatsapp_customers;
CREATE POLICY "whatsapp_customers_select" 
ON public.whatsapp_customers FOR SELECT 
TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "whatsapp_customers_write" ON public.whatsapp_customers;
CREATE POLICY "whatsapp_customers_write" 
ON public.whatsapp_customers FOR ALL 
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- WhatsApp conversations policies
DROP POLICY IF EXISTS "whatsapp_conversations_select" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_select" 
ON public.whatsapp_conversations FOR SELECT 
TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "whatsapp_conversations_write" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_write" 
ON public.whatsapp_conversations FOR ALL 
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- WhatsApp messages policies
DROP POLICY IF EXISTS "whatsapp_messages_select" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_select" 
ON public.whatsapp_messages FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
);

DROP POLICY IF EXISTS "whatsapp_messages_insert" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_insert" 
ON public.whatsapp_messages FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
);

-- WhatsApp orders policies
DROP POLICY IF EXISTS "whatsapp_orders_select" ON public.whatsapp_orders;
CREATE POLICY "whatsapp_orders_select" 
ON public.whatsapp_orders FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
);

DROP POLICY IF EXISTS "whatsapp_orders_insert" ON public.whatsapp_orders;
CREATE POLICY "whatsapp_orders_insert" 
ON public.whatsapp_orders FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
);

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Get or create WhatsApp customer
CREATE OR REPLACE FUNCTION get_or_create_whatsapp_customer(
  p_phone_number TEXT,
  p_restaurant_id UUID,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Try to find existing customer
  SELECT id INTO v_customer_id
  FROM public.whatsapp_customers
  WHERE phone_number = p_phone_number
  AND restaurant_id = p_restaurant_id;
  
  -- Create if not exists
  IF v_customer_id IS NULL THEN
    INSERT INTO public.whatsapp_customers (phone_number, restaurant_id, name)
    VALUES (p_phone_number, p_restaurant_id, p_name)
    RETURNING id INTO v_customer_id;
  END IF;
  
  RETURN v_customer_id;
END;
$$;

-- Get or create active conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_whatsapp_customer_id UUID,
  p_restaurant_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Try to find active conversation
  SELECT id INTO v_conversation_id
  FROM public.whatsapp_conversations
  WHERE whatsapp_customer_id = p_whatsapp_customer_id
  AND restaurant_id = p_restaurant_id
  AND is_active = true
  ORDER BY last_message_at DESC
  LIMIT 1;
  
  -- Create if not exists or last message was > 24 hours ago
  IF v_conversation_id IS NULL OR 
     (SELECT last_message_at FROM public.whatsapp_conversations WHERE id = v_conversation_id) < NOW() - INTERVAL '24 hours' THEN
    
    -- Mark old conversation as inactive
    IF v_conversation_id IS NOT NULL THEN
      UPDATE public.whatsapp_conversations
      SET is_active = false
      WHERE id = v_conversation_id;
    END IF;
    
    -- Create new conversation
    INSERT INTO public.whatsapp_conversations (
      restaurant_id,
      whatsapp_customer_id,
      state
    )
    VALUES (p_restaurant_id, p_whatsapp_customer_id, 'greeting')
    RETURNING id INTO v_conversation_id;
  END IF;
  
  RETURN v_conversation_id;
END;
$$;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.whatsapp_customers IS 'WhatsApp customers linked to phone numbers';
COMMENT ON TABLE public.whatsapp_conversations IS 'Active WhatsApp conversations with state management';
COMMENT ON TABLE public.whatsapp_messages IS 'All WhatsApp messages for analytics and debugging';
COMMENT ON TABLE public.whatsapp_orders IS 'Links WhatsApp conversations to placed orders';

COMMENT ON COLUMN public.orders.source IS 'Order source: web, qr, whatsapp, or admin';
COMMENT ON COLUMN public.restaurants.whatsapp_config IS 'WhatsApp bot configuration and credentials';
