import { supabase } from "@/integrations/supabase/client";

export type UserManagementAction = "reset_password" | "force_logout" | "disable_account" | "enable_account";

export interface UserManagementRequest {
    action: UserManagementAction;
    user_id: string;
    reason?: string;
}

export interface UserManagementResponse {
    success: boolean;
    message: string;
    reset_link?: string; // Only for reset_password in development
}

/**
 * Reset user password - sends password reset email
 */
export async function resetUserPassword(userId: string, reason?: string): Promise<UserManagementResponse> {
    const { data, error } = await supabase.functions.invoke("manage-user-account", {
        body: {
            action: "reset_password",
            user_id: userId,
            reason,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data as UserManagementResponse;
}

/**
 * Force logout user - revokes all active sessions
 */
export async function forceLogoutUser(userId: string, reason?: string): Promise<UserManagementResponse> {
    const { data, error } = await supabase.functions.invoke("manage-user-account", {
        body: {
            action: "force_logout",
            user_id: userId,
            reason,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data as UserManagementResponse;
}

/**
 * Disable user account - prevents login
 */
export async function disableUserAccount(userId: string, reason?: string): Promise<UserManagementResponse> {
    const { data, error } = await supabase.functions.invoke("manage-user-account", {
        body: {
            action: "disable_account",
            user_id: userId,
            reason,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data as UserManagementResponse;
}

/**
 * Enable user account - re-enables disabled account
 */
export async function enableUserAccount(userId: string): Promise<UserManagementResponse> {
    const { data, error } = await supabase.functions.invoke("manage-user-account", {
        body: {
            action: "enable_account",
            user_id: userId,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data as UserManagementResponse;
}
