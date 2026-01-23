# Testing Guide

## Running Tests

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/order-placement.spec.ts

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug

# Run in headed mode (see browser)
npx playwright test --headed
```

### Unit Tests (Vitest)

```bash
# Run all unit tests
npm run test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test -- --coverage
```

## Test Configuration

### Playwright Config
- **Base URL:** `http://localhost:8080`
- **Browser:** Chromium (can add Firefox/Safari)
- **Retries:** 2 on CI, 0 locally
- **Timeout:** 30 seconds per test

### Vitest Config
- **Environment:** jsdom
- **Globals:** Enabled
- **Setup:** `src/test/setup.ts`

## Test Credentials

For E2E tests that require authentication, use:
- **Email:** `admin@test.com`
- **Password:** `testpassword123`

> **Note:** These are test credentials. Create a test user in your Supabase project or update the tests with your actual test credentials.

## Writing New Tests

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup (e.g., login)
  });

  test('should do something', async ({ page }) => {
    // Arrange
    await page.goto('/some-page');
    
    // Act
    await page.click('button');
    
    // Assert
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myFunction';

describe('myFunction', () => {
  it('should return expected value', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

## CI/CD Integration

### GitHub Actions (Recommended)

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

## Troubleshooting

### Tests Failing Locally

1. **Ensure dev server is running:**
   ```bash
   npm run dev
   ```

2. **Clear browser cache:**
   ```bash
   npx playwright test --clear-cache
   ```

3. **Update Playwright browsers:**
   ```bash
   npx playwright install
   ```

### Authentication Tests Failing

- Verify test credentials exist in Supabase
- Check Supabase environment variables
- Ensure RLS policies allow test user access

### Timeout Errors

- Increase timeout in test:
  ```typescript
  test('slow test', async ({ page }) => {
    test.setTimeout(60000); // 60 seconds
    // ...
  });
  ```

## Test Coverage Goals

- **E2E Tests:** Cover all critical user flows
- **Unit Tests:** 80%+ code coverage
- **Integration Tests:** API endpoints and database operations
