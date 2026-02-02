/**
 * Cloudflare Turnstile Types and Utilities
 */

export interface TurnstileProps {
    /**
     * Your Cloudflare Turnstile Site Key
     * If not provided, it will try to use VITE_TURNSTILE_SITE_KEY env variable
     */
    siteKey?: string;

    /**
     * Callback invoked upon successful challenge completion
     * @param token The token string to valid on the server
     */
    onSuccess: (token: string) => void;

    /**
     * Callback invoked when the challenge expires or fails
     */
    onError?: (error?: any) => void;

    /**
     * Callback invoked when the token expires
     */
    onExpire?: () => void;

    /**
     * Theme for the widget
     * @default 'auto'
     */
    theme?: 'light' | 'dark' | 'auto';

    /**
     * Size of the widget
     * @default 'normal'
     */
    size?: 'normal' | 'compact' | 'flexible';

    /**
     * The action being performed (useful for analytics)
     * e.g., 'login', 'signup', 'forgot_password'
     */
    action?: string;

    /**
     * Extra CSS classes
     */
    className?: string;
}

declare global {
    interface Window {
        turnstile: {
            render: (
                element: HTMLElement | string,
                options: {
                    sitekey: string;
                    callback: (token: string) => void;
                    'error-callback'?: (error: any) => void;
                    'expired-callback'?: () => void;
                    theme?: 'light' | 'dark' | 'auto';
                    size?: 'normal' | 'compact' | 'flexible';
                    action?: string;
                    appearance?: 'always' | 'execute' | 'interaction-only';
                }
            ) => string;
            reset: (widgetId: string) => void;
            remove: (widgetId: string) => void;
            getResponse: (widgetId: string) => string | undefined;
        };
        onloadTurnstileCallback?: () => void;
    }
}

/**
 * Get the Turnstile Site Key from environment variables
 */
export const getTurnstileSiteKey = (): string => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) {
        console.warn('VITE_TURNSTILE_SITE_KEY is not defined in environment variables');
        return '';
    }
    return siteKey;
};
