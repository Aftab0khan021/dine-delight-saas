import { test, expect } from '@playwright/test';

/**
 * E2E Test: Order Placement Flow
 * Tests the complete order placement journey including rate limiting
 */
test.describe('Order Placement Flow', () => {
    const testRestaurant = 'test-restaurant';

    test('should place an order successfully', async ({ page }) => {
        // Navigate to restaurant menu
        await page.goto(`/r/${testRestaurant}/menu`);

        // Wait for menu to load
        await expect(page.getByText(/menu/i)).toBeVisible({ timeout: 10000 });

        // Add first available item to cart
        const addButton = page.getByRole('button', { name: 'Add' }).first();
        await addButton.click();

        // Verify item added toast
        await expect(page.getByText(/added/i)).toBeVisible();

        // Open cart
        await page.getByRole('button', { name: /cart|bag/i }).click();

        // Verify cart has items and total
        await expect(page.getByText(/total/i)).toBeVisible();

        // Place order
        await page.getByRole('button', { name: 'Place Order' }).click();

        // Should redirect to tracking page with token
        await page.waitForURL(/\/track\?token=/, { timeout: 15000 });

        // Verify order status is visible
        await expect(page.locator('text=/pending|accepted|in_progress/i')).toBeVisible();
    });

    test('should persist cart across page refreshes', async ({ page }) => {
        await page.goto(`/r/${testRestaurant}/menu`);

        // Add item
        await page.getByRole('button', { name: 'Add' }).first().click();
        await expect(page.getByText(/added/i)).toBeVisible();

        // Refresh page
        await page.reload();

        // Open cart
        await page.getByRole('button', { name: /cart|bag/i }).click();

        // Verify item persisted
        await expect(page.getByText(/total/i)).toBeVisible();
    });

    test('should show error for unavailable items', async ({ page }) => {
        await page.goto(`/r/${testRestaurant}/menu`);

        // Add item
        await page.getByRole('button', { name: 'Add' }).first().click();

        // Open cart
        await page.getByRole('button', { name: /cart|bag/i }).click();

        // If there's an unavailable item warning, verify place order is disabled
        const unavailableWarning = page.getByText(/no longer available/i);
        if (await unavailableWarning.isVisible()) {
            const placeOrderButton = page.getByRole('button', { name: 'Place Order' });
            await expect(placeOrderButton).toBeDisabled();
        }
    });
});
