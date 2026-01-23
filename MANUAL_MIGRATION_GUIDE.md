# Super Admin Migrations - Manual Deployment

## Issue

The `supabase db push` command is failing, likely due to enum type conflicts.

## Solution: Manual Deployment via SQL Editor

### Step 1: Open Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/itxbbdvqopfmuvwxxmtk/sql

### Step 2: Run Migrations in Order

Copy and paste each migration file content into the SQL editor and run them one by one:

#### Migration 1: Core Infrastructure

**File:** `supabase/migrations/20260123_super_admin_core_infrastructure.sql`

**Action:** Copy the entire file content and paste into SQL editor, then click "Run"

#### Migration 2: Enhance Tables

**File:** `supabase/migrations/20260123_super_admin_enhance_tables.sql`

**Action:** Copy the entire file content and paste into SQL editor, then click "Run"

### Step 3: Verify Deployment

After running both migrations, verify with these queries:

```sql
-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'subscription_plans',
    'feature_flags',
    'restaurant_features',
    'super_admin_audit_log',
    'platform_settings',
    'support_tickets'
  );
-- Should return 6 rows

-- Check default data
SELECT COUNT(*) FROM subscription_plans; -- Should be 3
SELECT COUNT(*) FROM feature_flags; -- Should be 7
SELECT COUNT(*) FROM platform_settings; -- Should be 5

-- Check new columns on restaurants
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
  AND column_name IN ('status', 'last_active_at');
-- Should return 2 rows

-- View platform metrics
SELECT * FROM platform_metrics;
```

### Step 4: Create Super Admin User

After successful deployment, assign yourself super admin role:

```sql
-- Get your user ID
SELECT id, email FROM auth.users WHERE email = 'YOUR_EMAIL@example.com';

-- Assign super_admin role (replace USER_ID with actual ID)
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_ID', 'super_admin')
ON CONFLICT DO NOTHING;

-- Verify
SELECT 
  u.email,
  ur.role
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'super_admin';
```

## Alternative: Fix Enum Issue

If you want to use `supabase db push`, the issue might be with the `app_role` enum. 

The enum was created with: `('super_admin', 'restaurant_admin', 'user')`

But we might need: `('super_admin', 'owner', 'restaurant_admin', 'user')`

To add 'owner' to the enum:

```sql
-- Check current enum values
SELECT unnest(enum_range(NULL::app_role));

-- Add 'owner' if missing
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'owner';
```

Then try `npx supabase db push` again.

## Recommended Approach

**Use Manual Deployment (SQL Editor)** - It's more reliable and gives you better error messages.

1. Open SQL Editor
2. Copy/paste migration 1
3. Run
4. Copy/paste migration 2
5. Run
6. Verify with queries above
7. Create super admin user

This approach avoids CLI issues and gives you immediate feedback.
