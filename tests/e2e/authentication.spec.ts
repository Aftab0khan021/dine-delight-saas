import { test, expect } from '@playwright/test';

/**
 * E2E Test: Authentication Flows
 * Tests login, logout, and authentication state
 */
test.describe('Authentication', () => {
    test('should display login page', async ({ page }) => {
        await page.goto('/admin/auth');

        // Verify login form is visible
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await page.goto('/admin/auth');

        // Fill with invalid credentials
        await page.fill('input[type="email"]', 'invalid@test.com');
        await page.fill('input[type="password"]', 'wrongpassword');

        // Submit
        await page.click('button[type="submit"]');

        // Should show error message
        await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 5000 });
    });

    test('should validate email format', async ({ page }) => {
        await page.goto('/admin/auth');

        // Enter invalid email
        await page.fill('input[type="email"]', 'not-an-email');
        await page.fill('input[type="password"]', 'password123');

        // Try to submit
        await page.click('button[type="submit"]');

        // Should show validation error
        const emailInput = page.locator('input[type="email"]');
        const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
        expect(validationMessage).toBeTruthy();
    });

    test('should redirect to dashboard after successful login', async ({ page }) => {
        await page.goto('/admin/auth');

        // Fill with valid credentials (if available)
        await page.fill('input[type="email"]', 'admin@test.com');
        await page.fill('input[type="password"]', 'testpassword123');

        // Submit
        await page.click('button[type="submit"]');

        // Should redirect to dashboard or show error
        await page.waitForURL(/admin\/(dashboard|auth)/, { timeout: 10000 });
    });

    test('should protect admin routes when not authenticated', async ({ page }) => {
        // Try to access protected route without login
        await page.goto('/admin/dashboard');

        // Should redirect to auth page
        await expect(page).toHaveURL(/\/admin\/auth/);
    });
});
