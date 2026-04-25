-- ============================================================
-- WhatsApp Schema Update - Fix phone_number_id field
-- Migration: Update whatsapp_config structure
-- ============================================================

-- Update the default whatsapp_config structure to include phone_number_id
-- This ensures new restaurants have the correct schema
ALTER TABLE public.restaurants
ALTER COLUMN whatsapp_config SET DEFAULT '{
  "enabled": false,
  "phone_number_id": null,
  "business_account_id": null,
  "access_token": null,
  "webhook_verify_token": null,
  "auto_reply_enabled": true,
  "greeting_message": "Welcome! How can I help you today?",
  "working_hours": {
    "enabled": false,
    "message": "We are currently closed. Our working hours are 9 AM - 10 PM."
  }
}'::jsonb;

-- Add comment for clarity
COMMENT ON COLUMN public.restaurants.whatsapp_config IS 'WhatsApp bot configuration: phone_number_id (for webhook routing), business_account_id, access_token (encrypted), greeting, hours';
