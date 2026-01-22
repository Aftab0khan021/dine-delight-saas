import posthog from "posthog-js";

/**
 * Initialize PostHog for analytics tracking
 * 
 * To use:
 * 1. Sign up at https://posthog.com (free tier: 1M events/month)
 * 2. Create a new project
 * 3. Copy your API key
 * 4. Add to .env: VITE_POSTHOG_KEY=phc_your_key_here
 * 5. Add to .env: VITE_POSTHOG_HOST=https://app.posthog.com (or your instance)
 */
export function initAnalytics() {
    const apiKey = import.meta.env.VITE_POSTHOG_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST || "https://app.posthog.com";
    const environment = import.meta.env.MODE;

    if (!apiKey) {
        console.info("PostHog API key not configured. Skipping analytics initialization.");
        return;
    }

    posthog.init(apiKey, {
        api_host: host,

        // Privacy settings
        autocapture: false, // Only track what we explicitly capture
        capture_pageview: true, // Auto track page views
        capture_pageleave: true, // Track when users leave

        // Performance
        loaded: (posthog) => {
            if (environment === "development") {
                posthog.debug(); // Enable debug mode in dev
            }
        },

        // Session recording (optional - privacy safe)
        session_recording: {
            maskAllInputs: true, // Hide all input values
            maskTextSelector: "*", // Mask all text
        },
    });
}

/**
 * Track a custom event
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
    if (typeof window !== "undefined" && posthog.__loaded) {
        posthog.capture(eventName, properties);
    }
}

/**
 * Identify a user (call after login)
 */
export function identifyUser(userId: string, properties?: Record<string, any>) {
    if (typeof window !== "undefined" && posthog.__loaded) {
        posthog.identify(userId, properties);
    }
}

/**
 * Reset user identity (call on logout)
 */
export function resetUser() {
    if (typeof window !== "undefined" && posthog.__loaded) {
        posthog.reset();
    }
}

/**
 * Set user properties
 */
export function setUserProperties(properties: Record<string, any>) {
    if (typeof window !== "undefined" && posthog.__loaded) {
        posthog.people.set(properties);
    }
}

export default posthog;
