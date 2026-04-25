-- ============================================================
-- DEPLOYMENT SCRIPT: AI Features Configuration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Step 1: Apply AI Features Migration
-- Copy and paste the contents of 20260202_ai_features.sql here
-- (The full migration file is in supabase/migrations/20260202_ai_features.sql)

-- Step 2: Set Encryption Key
-- Go to: Dashboard → Settings → Vault → Add new secret
-- Name: app.encryption_key
-- Value: [Generate a 32-character random string]
-- Example: openssl rand -base64 32

-- Step 3: Configure Test Restaurant
-- Replace 'YOUR_RESTAURANT_ID' with actual restaurant ID

DO $$
DECLARE
  test_restaurant_id UUID;
BEGIN
  -- Get first restaurant (or specify your test restaurant ID)
  SELECT id INTO test_restaurant_id
  FROM restaurants
  LIMIT 1;

  -- Update AI configuration
  UPDATE restaurants
  SET ai_config = '{
    "enabled": true,
    "nlp_provider": "regex",
    "image_provider": "tensorflow",
    "voice_provider": "whisper-local",
    "features": {
      "natural_language_ordering": true,
      "voice_messages": false,
      "image_recognition": false,
      "personalized_greetings": true,
      "recommendations": true,
      "birthday_offers": true,
      "real_time_notifications": true
    }
  }'::jsonb
  WHERE id = test_restaurant_id;

  RAISE NOTICE 'Configured restaurant: %', test_restaurant_id;
END $$;

-- Step 4: (Optional) Add API Keys for Paid Providers
-- Uncomment and configure if using OpenAI, Google, or HuggingFace

/*
-- Add OpenAI API Key
INSERT INTO restaurant_api_keys (restaurant_id, provider_name, api_key_encrypted)
VALUES (
  'YOUR_RESTAURANT_ID',
  'openai',
  encrypt_api_key('sk-YOUR_OPENAI_KEY')
);

-- Add Google Cloud Vision API Key
INSERT INTO restaurant_api_keys (restaurant_id, provider_name, api_key_encrypted)
VALUES (
  'YOUR_RESTAURANT_ID',
  'google',
  encrypt_api_key('AIza_YOUR_GOOGLE_KEY')
);

-- Add Hugging Face Token
INSERT INTO restaurant_api_keys (restaurant_id, provider_name, api_key_encrypted)
VALUES (
  'YOUR_RESTAURANT_ID',
  'huggingface',
  encrypt_api_key('hf_YOUR_HF_TOKEN')
);
*/

-- Step 5: Set up Cron Job for Notifications
-- Go to: Dashboard → Database → Cron Jobs → Create new job
-- Name: notification-worker
-- Schedule: * * * * * (every minute)
-- SQL:
SELECT cron.schedule(
  'notification-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://itxbbdvqopfmuvwxxmtk.supabase.co/functions/v1/notification-worker',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);

-- Step 6: Test Configuration
-- Verify AI providers are loaded
SELECT * FROM ai_providers ORDER BY provider_type, accuracy_rating DESC;

-- Verify restaurant configuration
SELECT id, name, ai_config FROM restaurants WHERE ai_config->>'enabled' = 'true';

-- Verify API keys (encrypted)
SELECT restaurant_id, provider_name, is_active, created_at 
FROM restaurant_api_keys;

-- ============================================================
-- QUICK TEST QUERIES
-- ============================================================

-- Test personalized greeting
SELECT * FROM whatsapp_customers LIMIT 5;

-- Test notification queue
SELECT * FROM notification_queue WHERE status = 'pending';

-- Test NLP cache
SELECT * FROM nlp_parse_cache ORDER BY created_at DESC LIMIT 10;

-- ============================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================

-- Add a test customer with birthday today
INSERT INTO whatsapp_customers (restaurant_id, phone_number, name, birthday)
VALUES (
  (SELECT id FROM restaurants LIMIT 1),
  '+1234567890',
  'Test Customer',
  CURRENT_DATE
);

-- Queue a test notification
SELECT queue_notification(
  p_restaurant_id := (SELECT id FROM restaurants LIMIT 1),
  p_customer_id := (SELECT id FROM whatsapp_customers LIMIT 1),
  p_notification_type := 'test',
  p_message := '🎉 This is a test notification!',
  p_scheduled_for := NOW()
);
