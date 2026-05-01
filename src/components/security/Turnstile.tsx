import { useEffect, useRef, useState, useCallback } from 'react';
import { TurnstileProps, getTurnstileSiteKey } from '@/lib/turnstile';

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function Turnstile({
    siteKey,
    onSuccess,
    onError,
    onExpire,
    onWidgetId,
    theme = 'auto',
    size = 'normal',
    action,
    className,
}: TurnstileProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    // ── Stable callback refs ──────────────────────────────────────────
    // Store the latest callbacks in refs so the render‑effect dependency
    // array stays stable.  Without this, every parent re‑render that
    // passes an inline arrow (e.g. inside a Drawer) tears down and
    // re‑creates the Turnstile iframe → infinite‑loading spinner.
    const onSuccessRef  = useRef(onSuccess);
    const onErrorRef    = useRef(onError);
    const onExpireRef   = useRef(onExpire);
    const onWidgetIdRef = useRef(onWidgetId);

    useEffect(() => { onSuccessRef.current  = onSuccess;  }, [onSuccess]);
    useEffect(() => { onErrorRef.current    = onError;    }, [onError]);
    useEffect(() => { onExpireRef.current   = onExpire;   }, [onExpire]);
    useEffect(() => { onWidgetIdRef.current = onWidgetId; }, [onWidgetId]);

    // Use provided site key or fall back to env var
    const effectiveSiteKey = siteKey || getTurnstileSiteKey();

    // ── Script loader ─────────────────────────────────────────────────
    useEffect(() => {
        // 1. Check if script is already present
        if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
            if (window.turnstile) {
                setIsScriptLoaded(true);
            } else {
                // Script tag exists but global not ready yet – wait for load
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
    }, []);

    // ── Widget renderer ───────────────────────────────────────────────
    // Only depends on script‑ready, site key, and presentational props.
    // Callbacks are accessed via refs so they never cause a re‑render.
    useEffect(() => {
        if (!isScriptLoaded || !containerRef.current || !effectiveSiteKey) return;

        // Small delay to let Drawer / portal animations finish so the
        // container has its final dimensions & position in the DOM.
        const timerId = setTimeout(() => {
            if (!containerRef.current) return;

            // Clean up previous widget if any
            if (widgetIdRef.current) {
                try { window.turnstile?.remove(widgetIdRef.current); } catch { /* ignore */ }
                widgetIdRef.current = null;
            }

            // Render new widget
            try {
                const id = window.turnstile.render(containerRef.current, {
                    sitekey: effectiveSiteKey,
                    callback: (token: string) => onSuccessRef.current(token),
                    'error-callback': (error: any) => onErrorRef.current?.(error),
                    'expired-callback': () => onExpireRef.current?.(),
                    theme,
                    size,
                    action,
                });
                widgetIdRef.current = id;
                onWidgetIdRef.current?.(id);
            } catch (error) {
                console.error('Failed to render Turnstile widget:', error);
                onErrorRef.current?.(error);
            }
        }, 150); // 150ms covers Drawer slide‑up animation

        return () => {
            clearTimeout(timerId);
            if (widgetIdRef.current) {
                try { window.turnstile?.remove(widgetIdRef.current); } catch { /* ignore */ }
                widgetIdRef.current = null;
            }
        };
    }, [isScriptLoaded, effectiveSiteKey, theme, size, action]);
    //  ↑ callbacks intentionally excluded — accessed via stable refs

    if (!effectiveSiteKey) {
        return <div className="text-red-500 text-sm p-4 border border-red-200 rounded">Turnstile Site Key is missing. Check VITE_TURNSTILE_SITE_KEY.</div>;
    }

    return <div ref={containerRef} className={className} />;
}
