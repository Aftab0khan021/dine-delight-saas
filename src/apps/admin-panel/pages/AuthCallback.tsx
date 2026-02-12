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

            if (type === "invite" && token) {
                // For invitations, redirect to password setup
                navigate(`/auth/set-password?${searchParams.toString()}`);
            } else {
                // For other auth types (signup, recovery, etc.), handle normally
                const { error } = await supabase.auth.exchangeCodeForSession(
                    searchParams.toString()
                );

                if (error) {
                    console.error("Auth callback error:", error);
                    navigate("/admin/auth?error=" + encodeURIComponent(error.message));
                } else {
                    // Successful auth, redirect to dashboard
                    navigate("/admin/dashboard");
                }
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
