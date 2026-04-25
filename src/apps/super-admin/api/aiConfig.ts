// API route for managing AI API keys
// This would typically be in your backend API routes

import { supabase } from '@/integrations/supabase/client';

export async function addAPIKey(
    restaurantId: string,
    providerName: string,
    apiKey: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Call Supabase RPC to encrypt the key
        const { data: encryptedKey, error: encryptError } = await supabase
            .rpc('encrypt_api_key', { key: apiKey });

        if (encryptError) throw encryptError;

        // Insert the encrypted key
        const { error: insertError } = await supabase
            .from('restaurant_api_keys')
            .insert({
                restaurant_id: restaurantId,
                provider_name: providerName,
                api_key_encrypted: encryptedKey,
                is_active: true,
            });

        if (insertError) throw insertError;

        return { success: true };
    } catch (error: any) {
        console.error('Error adding API key:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteAPIKey(keyId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('restaurant_api_keys')
            .delete()
            .eq('id', keyId);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('Error deleting API key:', error);
        return { success: false, error: error.message };
    }
}

export async function toggleAPIKey(
    keyId: string,
    isActive: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('restaurant_api_keys')
            .update({ is_active: isActive })
            .eq('id', keyId);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('Error toggling API key:', error);
        return { success: false, error: error.message };
    }
}

export async function updateAIConfig(
    restaurantId: string,
    aiConfig: any
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('restaurants')
            .update({ ai_config: aiConfig })
            .eq('id', restaurantId);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('Error updating AI config:', error);
        return { success: false, error: error.message };
    }
}
