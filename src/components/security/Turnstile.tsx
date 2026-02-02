import { useEffect, useRef, useState } from 'react';
import { TurnstileProps, getTurnstileSiteKey } from '@/lib/turnstile';

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function Turnstile({
    siteKey,
    onSuccess,
    onError,
    onExpire,
    theme = 'auto',
    size = 'normal',
    action,
    className,
}: TurnstileProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    // Use provided site key or fall back to env var
    const effectiveSiteKey = siteKey || getTurnstileSiteKey();

    useEffect(() => {
        // 1. Check if script is already present
        if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
            if (window.turnstile) {
                setIsScriptLoaded(true);
            } else {
                // Script exists but turnstile global not yet ready, wait for load
                const script = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement;
                const handleLoad = () => setIsScriptLoaded(true);
                script.addEventListener('load', handleLoad);
                return () => script.removeEventListener('load', handleLoad);
            }
            return;
        }

        // 2. Load script if not present
        const script = document.createElement('script');
        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => setIsScriptLoaded(true);
        document.head.appendChild(script);

        return () => {
            // We don't remove the script on unmount as other components might use it
            // But we can clean up event listeners if we added any specific ones
        };
    }, []);

    useEffect(() => {
        if (!isScriptLoaded || !containerRef.current || !effectiveSiteKey) return;

        // Clean up previous widget if any
        if (widgetIdRef.current) {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
        }

        // Render new widget
        try {
            const id = window.turnstile.render(containerRef.current, {
                sitekey: effectiveSiteKey,
                callback: (token) => onSuccess(token),
                'error-callback': (error) => onError?.(error),
                'expired-callback': () => onExpire?.(),
                theme,
                size,
                action,
            });
            widgetIdRef.current = id;
        } catch (error) {
            console.error('Failed to render Turnstile widget:', error);
            onError?.(error);
        }

        return () => {
            if (widgetIdRef.current) {
                // Check if window.turnstile still exists (it might be gone if script was removed)
                if (window.turnstile) {
                    window.turnstile.remove(widgetIdRef.current);
                }
                widgetIdRef.current = null;
            }
        };
    }, [isScriptLoaded, effectiveSiteKey, theme, size, action, onSuccess, onError, onExpire]);

    if (!effectiveSiteKey) {
        return <div className="text-red-500 text-sm p-4 border border-red-200 rounded">Turnstile Site Key is missing. Check VITE_TURNSTILE_SITE_KEY.</div>;
    }

    return <div ref={containerRef} className={className} />;
}
