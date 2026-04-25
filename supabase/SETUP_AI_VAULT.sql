-- ============================================================
-- STEP 1: Set Encryption Key in Supabase Vault
-- Copy this entire block and run in Supabase SQL Editor
-- ============================================================

-- Your generated encryption key: YpV3W3F4jKhgnx+L5RBe2fynTvlck8SQsl0NcOYrRV4=
-- SAVE THIS KEY SECURELY! You'll need it if you ever migrate databases.

-- Create the secret in Vault
SELECT vault.create_secret(
  'api_key_encryption_key',
  'YpV3W3F4jKhgnx+L5RBe2fynTvlck8SQsl0NcOYrRV4=',
  'Encryption key for AI provider API keys'
);

-- Verify it was created
SELECT name, description, created_at 
FROM vault.secrets 
WHERE name = 'api_key_encryption_key';

-- Test encryption (should return encrypted string)
SELECT encrypt_api_key('test-api-key-123');

-- ============================================================
-- STEP 2: Deploy Edge Functions
-- ============================================================

-- Option A: Via Supabase Dashboard
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "Edge Functions" in sidebar
-- 4. Create 4 new functions and copy code from:
--    - supabase/functions/api-key-manager/index.ts
--    - supabase/functions/nlp-parser/index.ts
--    - supabase/functions/voice-transcriber/index.ts
--    - supabase/functions/image-recognizer/index.ts

-- Option B: Install Supabase CLI and deploy
-- npm install -g supabase
-- supabase login
-- supabase link --project-ref YOUR-PROJECT-REF
-- supabase functions deploy api-key-manager
-- supabase functions deploy nlp-parser
-- supabase functions deploy voice-transcriber
-- supabase functions deploy image-recognizer

-- ============================================================
-- DONE! Now you can configure AI features in the admin panel
-- ============================================================
