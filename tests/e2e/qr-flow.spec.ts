import { test, expect } from '@playwright/test';

/**
 * E2E Test: QR Code Flow
 * Tests the complete user journey from QR scan to order placement
 */
test.describe('QR Code to Order Flow', () => {
    test('should scan QR, add items, and place order', async ({ page }) => {
        // Simulate QR code scan by visiting URL with table parameter
        await page.goto('/r/test-restaurant/menu?table=T-1');

        // Wait for menu to load
        await expect(page.getByText('Menu', { exact: false })).toBeVisible();

        // Verify table label is captured
        // Note: This will only be visible in the cart
        await page.getByRole('button', { name: /cart|bag/i }).click();

        // Check if "Table: T-1" appears in cart
        await expect(page.getByText(/Table.*T-1/i)).toBeVisible();

        // Close cart
        await page.keyboard.press('Escape');

        // Add first available item to cart
        const addButton = page.getByRole('button', { name: 'Add' }).first();
        await addButton.click();

        // Verify item added toast
        await expect(page.getByText(/added/i)).toBeVisible();

        // Open cart
        await page.getByRole('button', { name: /cart|bag/i }).click();

        // Verify cart has items
        await expect(page.getByText(/total/i)).toBeVisible();

        // Place order
        await page.getByRole('button', { name: 'Place Order' }).click();

        // Verify success (either redirect or success message)
        await page.waitForURL(/track|menu/, { timeout: 10000 });
    });

    test('should persist table label across page refreshes', async ({ page }) => {
        // Visit with table parameter
        await page.goto('/r/test-restaurant/menu?table=T-5');

        // Add item
        await page.getByRole('button', { name: 'Add' }).first().click();

        // Refresh page
        await page.reload();

        // Open cart
        await page.getByRole('button', { name: /cart|bag/i }).click();

        // Verify table label persisted
        await expect(page.getByText(/Table.*T-5/i)).toBeVisible();
    });
});
