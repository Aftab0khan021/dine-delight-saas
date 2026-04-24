import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            const type = searchParams.get("type");
            const token = searchParams.get("token");

            // Supabase sends recovery/invite tokens in the URL hash as #access_token=...&type=recovery
            // Parse hash fragment if present
            const hash = window.location.hash;
            const hashParams = new URLSearchParams(hash.replace("#", ""));
            const hashType = hashParams.get("type");
            const hashAccessToken = hashParams.get("access_token");
            const hashRefreshToken = hashParams.get("refresh_token");

            // Handle hash-based recovery (Supabase PKCE flow sends tokens in hash)
            if ((hashType === "recovery" || type === "recovery") && (hashAccessToken || token)) {
                // Set the session from the hash tokens so the user is authenticated
                if (hashAccessToken && hashRefreshToken) {
                    await supabase.auth.setSession({
                        access_token: hashAccessToken,
                        refresh_token: hashRefreshToken,
                    });
                }
                // Redirect to set-password page for the user to choose a new password
                navigate("/auth/set-password");
                return;
            }

            if (type === "invite" && token) {
                // For invitations, redirect to password setup
                navigate(`/auth/set-password?${searchParams.toString()}`);
                return;
            }

            // For other auth types (signup confirmation, etc.), exchange code for session
            const code = searchParams.get("code");
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) {
                    console.error("Auth callback error:", error);
                    navigate("/admin/auth?error=" + encodeURIComponent(error.message));
                } else {
                    navigate("/admin/dashboard");
                }
                return;
            }

            // Fallback — check if a session already exists
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                navigate("/admin/dashboard");
            } else {
                navigate("/admin/auth");
            }
        };

        handleCallback();
    }, [searchParams, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-4 text-gray-600">Processing authentication...</p>
            </div>
        </div>
    );
}
