import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActiveImpersonationSession, endImpersonation } from "../lib/impersonation";

export interface ImpersonationState {
    isImpersonating: boolean;
    isReadOnly: boolean;
    sessionId: string | null;
    superAdminId: string | null;
    expiresAt: string | null;
}

export function useImpersonation() {
    const [impersonationState, setImpersonationState] = useState<ImpersonationState>({
        isImpersonating: false,
        isReadOnly: false,
        sessionId: null,
        superAdminId: null,
        expiresAt: null,
    });

    // Check for impersonation session
    const { data: session, refetch } = useQuery({
        queryKey: ['impersonation-session'],
        queryFn: getActiveImpersonationSession,
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    useEffect(() => {
        if (session) {
            setImpersonationState({
                isImpersonating: session.is_active || false,
                isReadOnly: session.is_read_only || false,
                sessionId: session.session_id,
                superAdminId: session.super_admin_id,
                expiresAt: session.expires_at,
            });
        }
    }, [session]);

    const handleEndImpersonation = async () => {
        if (!impersonationState.sessionId) return false;

        try {
            await endImpersonation(impersonationState.sessionId);

            // Redirect to super admin panel
            window.location.href = '/superadmin/restaurants';

            return true;
        } catch (error) {
            console.error("Failed to end impersonation:", error);
            return false;
        }
    };

    return {
        ...impersonationState,
        endImpersonation: handleEndImpersonation,
        refreshSession: refetch,
    };
}
