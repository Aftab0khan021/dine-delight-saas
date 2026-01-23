import { supabase } from "@/integrations/supabase/client";

export interface ActiveImpersonationSession {
    is_active: boolean;
    session_id: string | null;
    super_admin_id: string | null;
    is_read_only: boolean | null;
    expires_at: string | null;
}

/**
 * Get active impersonation session for current user
 */
export async function getActiveImpersonationSession(): Promise<ActiveImpersonationSession> {
    const { data, error } = await supabase.rpc('is_impersonating');

    if (error) {
        console.error("Error checking impersonation status:", error);
        return {
            is_active: false,
            session_id: null,
            super_admin_id: null,
            is_read_only: null,
            expires_at: null,
        };
    }

    // The RPC returns an array, get the first result
    const result = Array.isArray(data) ? data[0] : data;

    return result || {
        is_active: false,
        session_id: null,
        super_admin_id: null,
        is_read_only: null,
        expires_at: null,
    };
}

/**
 * End an impersonation session
 */
export async function endImpersonation(sessionId: string): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke("impersonate-user/end-impersonation", {
        body: {
            session_id: sessionId,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data?.success || false;
}
