-- Check if the trigger exists
SELECT 
  tgname as trigger_name,
  tgtype,
  tgenabled
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created_handle_invite';

-- Check if the function exists
SELECT 
  proname as function_name,
  prosrc as function_body
FROM pg_proc 
WHERE proname = 'handle_invited_user';

-- Test the metadata structure
SELECT 
  id,
  email,
  raw_user_meta_data->>'restaurant_id' as restaurant_id,
  raw_user_meta_data->>'role' as role,
  raw_user_meta_data->>'staff_category_id' as staff_category_id
FROM auth.users 
WHERE email = 'paftab320@gmail.com';
