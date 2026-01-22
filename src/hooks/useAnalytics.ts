import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";

/**
 * React hook for analytics tracking
 * 
 * Usage:
 * const analytics = useAnalytics();
 * analytics.track("button_clicked", { button_name: "checkout" });
 */
export function useAnalytics() {
    const location = useLocation();

    // Track page views automatically
    useEffect(() => {
        trackEvent("$pageview", {
            path: location.pathname,
            search: location.search,
        });
    }, [location]);

    return {
        track: trackEvent,
    };
}

/**
 * Track order events
 */
export function useOrderTracking() {
    const trackOrderStarted = (restaurantId: string) => {
        trackEvent("order_started", {
            restaurant_id: restaurantId,
            timestamp: new Date().toISOString(),
        });
    };

    const trackOrderCompleted = (orderId: string, restaurantId: string, totalCents: number, itemCount: number) => {
        trackEvent("order_completed", {
            order_id: orderId,
            restaurant_id: restaurantId,
            total_cents: totalCents,
            item_count: itemCount,
            timestamp: new Date().toISOString(),
        });
    };

    const trackCartAbandoned = (restaurantId: string, itemCount: number, totalCents: number) => {
        trackEvent("cart_abandoned", {
            restaurant_id: restaurantId,
            item_count: itemCount,
            total_cents: totalCents,
            timestamp: new Date().toISOString(),
        });
    };

    return {
        trackOrderStarted,
        trackOrderCompleted,
        trackCartAbandoned,
    };
}

/**
 * Track menu interactions
 */
export function useMenuTracking() {
    const trackMenuItemViewed = (itemId: string, itemName: string, priceCents: number) => {
        trackEvent("menu_item_viewed", {
            item_id: itemId,
            item_name: itemName,
            price_cents: priceCents,
        });
    };

    const trackMenuItemAdded = (itemId: string, itemName: string, quantity: number) => {
        trackEvent("menu_item_added", {
            item_id: itemId,
            item_name: itemName,
            quantity: quantity,
        });
    };

    return {
        trackMenuItemViewed,
        trackMenuItemAdded,
    };
}

/**
 * Track QR code scans
 */
export function trackQRScan(tableLabel: string, restaurantId: string) {
    trackEvent("qr_scanned", {
        table_label: tableLabel,
        restaurant_id: restaurantId,
        timestamp: new Date().toISOString(),
    });
}
