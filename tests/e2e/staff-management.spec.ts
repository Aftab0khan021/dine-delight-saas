import { test, expect } from '@playwright/test';

/**
 * E2E Test: Staff Management
 * Tests staff invitation and management functionality
 */
test.describe('Staff Management', () => {
    test.beforeEach(async ({ page }) => {
        // Login as admin
        await page.goto('/admin/auth');

        // Fill login form
        await page.fill('input[type="email"]', 'admin@test.com');
        await page.fill('input[type="password"]', 'testpassword123');

        // Submit
        await page.click('button[type="submit"]');

        // Wait for redirect to dashboard
        await page.waitForURL('/admin/dashboard', { timeout: 10000 });
    });

    test('should display staff page', async ({ page }) => {
        await page.goto('/admin/staff');

        // Verify page loaded
        await expect(page.getByRole('heading', { name: /staff/i })).toBeVisible();
    });

    test('should open invite dialog', async ({ page }) => {
        await page.goto('/admin/staff');

        // Click invite button
        const inviteButton = page.getByRole('button', { name: /invite staff/i });
        await inviteButton.click();

        // Verify dialog opened
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByText(/email/i)).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
        await page.goto('/admin/staff');

        // Open invite dialog
        await page.getByRole('button', { name: /invite staff/i }).click();

        // Enter invalid email
        await page.fill('input[name="email"]', 'invalid-email');

        // Try to submit
        await page.click('button[type="submit"]');

        // Should show validation error
        await expect(page.getByText(/valid email/i)).toBeVisible();
    });
});
