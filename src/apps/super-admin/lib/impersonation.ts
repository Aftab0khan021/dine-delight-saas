import { supabase } from "@/integrations/supabase/client";

export interface ImpersonationSession {
    session_id: string;
    impersonation_url: string;
    expires_at: string;
    is_read_only: boolean;
    restaurant: {
        id: string;
        name: string;
        slug: string;
    };
    target_user: {
        id: string;
        email: string;
        full_name?: string;
    };
}

export interface ActiveImpersonationSession {
    is_active: boolean;
    session_id: string | null;
    super_admin_id: string | null;
    is_read_only: boolean | null;
    expires_at: string | null;
}

/**
 * Start an impersonation session
 */
export async function startImpersonation(
    restaurantId: string,
    targetUserId: string,
    isReadOnly: boolean = true
): Promise<ImpersonationSession> {
    const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: {
            restaurant_id: restaurantId,
            target_user_id: targetUserId,
            is_read_only: isReadOnly,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data as ImpersonationSession;
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
 * Get impersonation session by token (from URL parameter)
 */
export async function getImpersonationSessionByToken(token: string) {
    const { data, error } = await supabase.rpc('get_impersonation_session_by_token', {
        p_token: token
    });

    if (error) {
        console.error("Error getting impersonation session by token:", error);
        return null;
    }

    return Array.isArray(data) ? data[0] : data;
}
