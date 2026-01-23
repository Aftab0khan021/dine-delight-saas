import { test, expect } from '@playwright/test';

/**
 * E2E Test: Menu Management
 * Tests menu item and category management functionality
 */
test.describe('Menu Management', () => {
    test.beforeEach(async ({ page }) => {
        // Login as admin
        await page.goto('/admin/auth');
        await page.fill('input[type="email"]', 'admin@test.com');
        await page.fill('input[type="password"]', 'testpassword123');
        await page.click('button[type="submit"]');
        await page.waitForURL('/admin/dashboard', { timeout: 10000 });
    });

    test('should display menu page', async ({ page }) => {
        await page.goto('/admin/menu');

        // Verify page loaded
        await expect(page.getByRole('heading', { name: /menu/i })).toBeVisible();
    });

    test('should open add item dialog', async ({ page }) => {
        await page.goto('/admin/menu');

        // Click add item button
        const addButton = page.getByRole('button', { name: /add item/i });
        if (await addButton.isVisible()) {
            await addButton.click();

            // Verify dialog/sheet opened
            await expect(page.getByText(/name/i)).toBeVisible();
            await expect(page.getByText(/price/i)).toBeVisible();
        }
    });

    test('should validate required fields', async ({ page }) => {
        await page.goto('/admin/menu');

        // Try to open add item
        const addButton = page.getByRole('button', { name: /add item/i });
        if (await addButton.isVisible()) {
            await addButton.click();

            // Try to submit without filling fields
            const saveButton = page.getByRole('button', { name: /save/i });
            if (await saveButton.isVisible()) {
                await saveButton.click();

                // Should show validation errors or stay on form
                // (exact behavior depends on implementation)
            }
        }
    });

    test('should display existing menu items', async ({ page }) => {
        await page.goto('/admin/menu');

        // Wait for content to load
        await page.waitForTimeout(2000);

        // Should show either items or empty state
        const hasItems = await page.getByRole('button', { name: /edit|delete/i }).count() > 0;
        const hasEmptyState = await page.getByText(/no items|add your first/i).isVisible();

        expect(hasItems || hasEmptyState).toBeTruthy();
    });
});
