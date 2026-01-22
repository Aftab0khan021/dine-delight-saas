import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRestaurantCart } from '@/apps/public-website/hooks/useRestaurantCart';

/**
 * Unit tests for useRestaurantCart hook
 * Tests cart functionality including add, remove, and table label tracking
 */
describe('useRestaurantCart', () => {
    const testSlug = 'test-restaurant';

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
    });

    it('should initialize with empty cart', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        expect(result.current.items).toEqual([]);
        expect(result.current.itemCount).toBe(0);
        expect(result.current.subtotalCents).toBe(0);
    });

    it('should add item to cart', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        act(() => {
            result.current.addItem({
                menu_item_id: 'item-1',
                name: 'Test Item',
                price_cents: 1000,
            });
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].name).toBe('Test Item');
        expect(result.current.itemCount).toBe(1);
        expect(result.current.subtotalCents).toBe(1000);
    });

    it('should increment item quantity', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        act(() => {
            result.current.addItem({
                menu_item_id: 'item-1',
                name: 'Test Item',
                price_cents: 1000,
            });
        });

        act(() => {
            result.current.increment('item-1');
        });

        expect(result.current.items[0].quantity).toBe(2);
        expect(result.current.itemCount).toBe(2);
        expect(result.current.subtotalCents).toBe(2000);
    });

    it('should decrement item quantity', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        act(() => {
            result.current.addItem({
                menu_item_id: 'item-1',
                name: 'Test Item',
                price_cents: 1000,
            });
            result.current.increment('item-1');
        });

        act(() => {
            result.current.decrement('item-1');
        });

        expect(result.current.items[0].quantity).toBe(1);
    });

    it('should remove item when quantity reaches 0', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        act(() => {
            result.current.addItem({
                menu_item_id: 'item-1',
                name: 'Test Item',
                price_cents: 1000,
            });
        });

        act(() => {
            result.current.decrement('item-1');
        });

        expect(result.current.items).toHaveLength(0);
    });

    it('should set and persist table label', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        act(() => {
            result.current.setTableLabel('T-1');
        });

        expect(result.current.tableLabel).toBe('T-1');

        // Verify it's saved to localStorage
        const stored = JSON.parse(localStorage.getItem(`cart:${testSlug}`) || '{}');
        expect(stored.tableLabel).toBe('T-1');
    });

    it('should clear cart', () => {
        const { result } = renderHook(() => useRestaurantCart(testSlug));

        act(() => {
            result.current.addItem({
                menu_item_id: 'item-1',
                name: 'Test Item',
                price_cents: 1000,
            });
            result.current.setTableLabel('T-1');
        });

        act(() => {
            result.current.clear();
        });

        expect(result.current.items).toHaveLength(0);
        expect(result.current.tableLabel).toBeNull();
    });
});
