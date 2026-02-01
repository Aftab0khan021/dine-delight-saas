-- ============================================================
-- Set Encryption Key in Supabase Vault
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Generate encryption key (run in terminal first):
-- openssl rand -base64 32

-- Step 2: Store the key in Supabase Vault
-- Replace 'YOUR-GENERATED-KEY-HERE' with the actual key from step 1
SELECT vault.create_secret(
  'api_key_encryption_key',
  'YOUR-GENERATED-KEY-HERE',
  'Encryption key for AI provider API keys'
);

-- Step 3: Verify the secret was created
SELECT * FROM vault.secrets WHERE name = 'api_key_encryption_key';

-- Step 4: Test encryption/decryption functions
-- Test encrypt
SELECT encrypt_api_key('test-api-key-123');

-- Test decrypt (use the encrypted value from above)
-- SELECT decrypt_api_key('ENCRYPTED-VALUE-HERE');

-- ============================================================
-- IMPORTANT: Save your encryption key securely!
-- If you lose it, you won't be able to decrypt existing API keys
-- ============================================================
