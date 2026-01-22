import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry for error tracking in production
 * 
 * To use:
 * 1. Sign up at https://sentry.io
 * 2. Create a new project (React)
 * 3. Copy your DSN
 * 4. Add to .env: VITE_SENTRY_DSN=your_dsn_here
 */
export function initSentry() {
    // Only initialize in production or if DSN is provided
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    const environment = import.meta.env.MODE;

    if (!dsn) {
        console.info("Sentry DSN not configured. Skipping initialization.");
        return;
    }

    Sentry.init({
        dsn,
        environment,

        // Set sample rate (1.0 = 100% of errors)
        sampleRate: 1.0,

        // Performance Monitoring
        tracesSampleRate: environment === "production" ? 0.1 : 1.0, // 10% in prod, 100% in dev

        // Session Replay (optional - captures user sessions for debugging)
        replaysSessionSampleRate: 0.1, // 10% of sessions
        replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

        integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
                maskAllText: true, // Privacy: mask all text
                blockAllMedia: true, // Privacy: block all media
            }),
        ],

        // Filter out known non-critical errors
        beforeSend(event, hint) {
            // Ignore ResizeObserver errors (common browser quirk)
            if (event.message?.includes("ResizeObserver")) {
                return null;
            }

            // Ignore network errors (user offline)
            if (hint.originalException?.message?.includes("Failed to fetch")) {
                return null;
            }

            return event;
        },
    });
}
