# Test Setup Instructions

## Test Results

Initial test run: **3 passed, 14 failed**

The failures are expected because the tests need proper setup with test data and authentication.

## Setup Required

### 1. Create Test User in Supabase

1. Go to your Supabase project
2. Navigate to Authentication > Users
3. Create a new user:
   - **Email:** `admin@test.com`
   - **Password:** `testpassword123`
   - **Confirm email:** Yes

### 2. Assign Admin Role

Run this SQL in Supabase SQL Editor:

```sql
-- Get the user ID
SELECT id, email FROM auth.users WHERE email = 'admin@test.com';

-- Create a test restaurant
INSERT INTO restaurants (name, slug, is_accepting_orders)
VALUES ('Test Restaurant', 'test-restaurant', true)
RETURNING id;

-- Assign restaurant_admin role (replace with actual IDs)
INSERT INTO user_roles (user_id, restaurant_id, role)
VALUES (
  'user-id-from-above',
  'restaurant-id-from-above',
  'restaurant_admin'
);
```

### 3. Create Test Menu Items

```sql
-- Get restaurant ID
SELECT id FROM restaurants WHERE slug = 'test-restaurant';

-- Create a category
INSERT INTO categories (restaurant_id, name, sort_order)
VALUES ('restaurant-id', 'Test Category', 0)
RETURNING id;

-- Create menu items
INSERT INTO menu_items (restaurant_id, category_id, name, description, price_cents, is_active)
VALUES 
  ('restaurant-id', 'category-id', 'Test Burger', 'Delicious test burger', 1299, true),
  ('restaurant-id', 'category-id', 'Test Pizza', 'Amazing test pizza', 1599, true),
  ('restaurant-id', 'category-id', 'Test Salad', 'Fresh test salad', 899, true);
```

### 4. Update Test Credentials (if needed)

If you want to use different credentials, update these files:
- `tests/e2e/staff-management.spec.ts`
- `tests/e2e/menu-management.spec.ts`
- `tests/e2e/authentication.spec.ts`

Change:
```typescript
await page.fill('input[type="email"]', 'your-email@test.com');
await page.fill('input[type="password"]', 'your-password');
```

### 5. Run Tests Again

```bash
# Run all tests
npm run test:e2e

# Run specific test
npx playwright test tests/e2e/authentication.spec.ts

# Run with UI
npm run test:e2e:ui
```

## Common Test Failures

### Authentication Failures
**Cause:** Test user doesn't exist or wrong credentials  
**Fix:** Create test user in Supabase (see step 1)

### Restaurant Not Found
**Cause:** Test restaurant doesn't exist  
**Fix:** Create test restaurant (see step 2)

### Menu Items Not Found
**Cause:** No menu items in test restaurant  
**Fix:** Create test menu items (see step 3)

### Timeout Errors
**Cause:** Slow network or server  
**Fix:** Increase timeout in test:
```typescript
test.setTimeout(60000); // 60 seconds
```

## Test Data Cleanup

After testing, you can clean up test data:

```sql
-- Delete test orders
DELETE FROM orders WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test menu items
DELETE FROM menu_items WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test categories
DELETE FROM categories WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test restaurant
DELETE FROM restaurants WHERE slug = 'test-restaurant';

-- Delete test user (optional)
-- DELETE FROM auth.users WHERE email = 'admin@test.com';
```

## Next Steps

1. ✅ Set up test user and data
2. ✅ Run tests again
3. ✅ Fix any remaining failures
4. ✅ Add more test cases
5. ✅ Set up CI/CD for automated testing
