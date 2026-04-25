-- ============================================================
-- AI Features - Configurable Provider System
-- Migration: Add AI configuration and personalization
-- ============================================================

-- ============================================================
-- 1. AI PROVIDERS CATALOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type TEXT NOT NULL, -- 'nlp', 'image', 'voice'
  provider_name TEXT NOT NULL, -- 'openai', 'huggingface', 'google', 'regex', 'tensorflow'
  display_name TEXT NOT NULL,
  description TEXT,
  is_free BOOLEAN DEFAULT false,
  requires_api_key BOOLEAN DEFAULT true,
  estimated_cost_per_1k TEXT, -- e.g., "$0.002", "Free"
  accuracy_rating INT, -- 1-5 stars
  setup_instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed AI providers
INSERT INTO public.ai_providers (provider_type, provider_name, display_name, description, is_free, requires_api_key, estimated_cost_per_1k, accuracy_rating) VALUES
-- NLP Providers
('nlp', 'regex', 'Pattern Matching', 'Simple regex-based parsing. Best for basic orders.', true, false, 'Free', 3),
('nlp', 'huggingface', 'Hugging Face', 'Open-source AI models. Good accuracy, free tier available.', true, true, '$0.001', 4),
('nlp', 'openai', 'OpenAI GPT-4o-mini', 'Most accurate NLP. Handles complex orders.', false, true, '$0.002', 5),

-- Image Providers
('image', 'tensorflow', 'TensorFlow.js', 'Client-side image recognition. Free but limited.', true, false, 'Free', 3),
('image', 'huggingface', 'Hugging Face Vision', 'Open-source vision models. Good accuracy.', true, true, '$0.001', 4),
('image', 'google', 'Google Cloud Vision', 'Industry-leading accuracy. Best for production.', false, true, '$1.50', 5),

-- Voice Providers
('voice', 'whisper-local', 'Whisper (Self-hosted)', 'Self-hosted Whisper model. Free but requires setup.', true, false, 'Free', 4),
('voice', 'openai', 'OpenAI Whisper API', 'Cloud-based transcription. Most accurate.', false, true, '$0.006/min', 5);

-- ============================================================
-- 2. RESTAURANT AI CONFIGURATION
-- ============================================================
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS ai_config JSONB DEFAULT '{
  "enabled": false,
  "nlp_provider": "regex",
  "image_provider": "tensorflow",
  "voice_provider": "whisper-local",
  "features": {
    "natural_language_ordering": false,
    "voice_messages": false,
    "image_recognition": false,
    "personalized_greetings": false,
    "recommendations": false,
    "birthday_offers": false,
    "real_time_notifications": false
  }
}'::jsonb;

-- ============================================================
-- 3. ENCRYPTED API KEYS STORAGE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.restaurant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL, -- 'openai', 'huggingface', 'google'
  api_key_encrypted TEXT NOT NULL, -- Encrypted using pgcrypto
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, provider_name)
);

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to encrypt API keys
CREATE OR REPLACE FUNCTION encrypt_api_key(key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    pgp_sym_encrypt(
      key,
      current_setting('app.encryption_key', true)
    ),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to decrypt API keys
CREATE OR REPLACE FUNCTION decrypt_api_key(encrypted_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    decode(encrypted_key, 'base64'),
    current_setting('app.encryption_key', true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. CUSTOMER PERSONALIZATION
-- ============================================================
ALTER TABLE public.whatsapp_customers 
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS anniversary DATE,
  ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Customer preferences tracking
CREATE TABLE IF NOT EXISTS public.customer_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.whatsapp_customers(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL, -- 'usual_order', 'favorite_time', 'preferred_payment'
  preference_data JSONB NOT NULL,
  frequency INT DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_preferences_customer 
ON public.customer_preferences(customer_id, preference_type);

-- Function to detect usual order
CREATE OR REPLACE FUNCTION get_usual_order(p_customer_id UUID)
RETURNS JSONB AS $$
DECLARE
  usual_order JSONB;
BEGIN
  SELECT preference_data INTO usual_order
  FROM public.customer_preferences
  WHERE customer_id = p_customer_id
    AND preference_type = 'usual_order'
  ORDER BY frequency DESC, last_used_at DESC
  LIMIT 1;
  
  RETURN usual_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. NOTIFICATION QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.whatsapp_customers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL, -- 'order_status', 'birthday', 'anniversary', 'special_offer'
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_pending 
ON public.notification_queue(status, scheduled_for)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notifications_customer 
ON public.notification_queue(customer_id, created_at DESC);

-- ============================================================
-- 6. NLP PARSE CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nlp_parse_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  input_text TEXT NOT NULL,
  parsed_intent JSONB NOT NULL,
  provider_used TEXT NOT NULL,
  confidence_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nlp_cache_text 
ON public.nlp_parse_cache(restaurant_id, input_text);

-- Index for cache cleanup (use cron job to delete old entries)
CREATE INDEX IF NOT EXISTS idx_nlp_cache_created 
ON public.nlp_parse_cache(created_at DESC);

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Queue notification
CREATE OR REPLACE FUNCTION queue_notification(
  p_restaurant_id UUID,
  p_customer_id UUID,
  p_notification_type TEXT,
  p_message TEXT,
  p_scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  p_order_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.notification_queue (
    restaurant_id,
    customer_id,
    order_id,
    notification_type,
    message,
    scheduled_for
  ) VALUES (
    p_restaurant_id,
    p_customer_id,
    p_order_id,
    p_notification_type,
    p_message,
    p_scheduled_for
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Check if birthday today
CREATE OR REPLACE FUNCTION is_birthday_today(p_customer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  customer_birthday DATE;
  today_mmdd TEXT;
  birthday_mmdd TEXT;
BEGIN
  SELECT birthday INTO customer_birthday
  FROM public.whatsapp_customers
  WHERE id = p_customer_id;
  
  IF customer_birthday IS NULL THEN
    RETURN FALSE;
  END IF;
  
  today_mmdd := TO_CHAR(CURRENT_DATE, 'MM-DD');
  birthday_mmdd := TO_CHAR(customer_birthday, 'MM-DD');
  
  RETURN today_mmdd = birthday_mmdd;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old NLP cache entries (call from cron job)
CREATE OR REPLACE FUNCTION cleanup_old_nlp_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.nlp_parse_cache
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nlp_parse_cache ENABLE ROW LEVEL SECURITY;

-- AI Providers (public read)
DROP POLICY IF EXISTS "ai_providers_public_read" ON public.ai_providers;
CREATE POLICY "ai_providers_public_read" 
ON public.ai_providers FOR SELECT 
TO authenticated 
USING (true);

-- Restaurant API Keys (restaurant owners only)
DROP POLICY IF EXISTS "restaurant_api_keys_select" ON public.restaurant_api_keys;
CREATE POLICY "restaurant_api_keys_select" 
ON public.restaurant_api_keys FOR SELECT 
TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "restaurant_api_keys_write" ON public.restaurant_api_keys;
CREATE POLICY "restaurant_api_keys_write" 
ON public.restaurant_api_keys FOR ALL 
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- Customer Preferences
DROP POLICY IF EXISTS "customer_preferences_select" ON public.customer_preferences;
CREATE POLICY "customer_preferences_select" 
ON public.customer_preferences FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_customers wc
    WHERE wc.id = customer_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
);

DROP POLICY IF EXISTS "customer_preferences_write" ON public.customer_preferences;
CREATE POLICY "customer_preferences_write" 
ON public.customer_preferences FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_customers wc
    WHERE wc.id = customer_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_customers wc
    WHERE wc.id = customer_id
    AND public.has_restaurant_access(auth.uid(), wc.restaurant_id)
  )
);

-- Notification Queue
DROP POLICY IF EXISTS "notification_queue_select" ON public.notification_queue;
CREATE POLICY "notification_queue_select" 
ON public.notification_queue FOR SELECT 
TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "notification_queue_write" ON public.notification_queue;
CREATE POLICY "notification_queue_write" 
ON public.notification_queue FOR ALL 
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- NLP Cache
DROP POLICY IF EXISTS "nlp_cache_select" ON public.nlp_parse_cache;
CREATE POLICY "nlp_cache_select" 
ON public.nlp_parse_cache FOR SELECT 
TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "nlp_cache_write" ON public.nlp_parse_cache;
CREATE POLICY "nlp_cache_write" 
ON public.nlp_parse_cache FOR ALL 
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));
