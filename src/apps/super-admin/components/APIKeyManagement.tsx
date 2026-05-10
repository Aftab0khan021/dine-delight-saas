import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Key, Plus, Trash2, CheckCircle, XCircle, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface APIKey {
    id: string;
    provider_name: string;
    is_active: boolean;
    created_at: string;
}

interface ProviderOption {
    provider_name: string;
    display_name: string;
}

interface Props {
    restaurantId: string;
}

export default function APIKeyManagement({ restaurantId }: Props) {
    const { toast } = useToast();
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newKey, setNewKey] = useState({ provider: '', key: '' });
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

    // Bug Fix #4: Fetch provider options from DB instead of hardcoding
    const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);

    useEffect(() => {
        fetchKeys();
        fetchProviderOptions();
    }, [restaurantId]);

    // Bug Fix #4: Get providers that require API keys from the DB
    const fetchProviderOptions = async () => {
        try {
            const { data, error } = await supabase
                .from('ai_providers')
                .select('provider_name, display_name')
                .eq('requires_api_key', true)
                .eq('is_active', true)
                .order('display_name');

            if (error) throw error;

            // Deduplicate by provider_name (same provider can appear for multiple types)
            const unique = new Map<string, ProviderOption>();
            (data || []).forEach(p => {
                if (!unique.has(p.provider_name)) {
                    unique.set(p.provider_name, p);
                }
            });

            setProviderOptions(Array.from(unique.values()));
        } catch (error) {
            console.error('Error fetching providers:', error);
        }
    };

    const fetchKeys = async () => {
        try {
            const { data, error } = await supabase
                .from('restaurant_api_keys')
                .select('id, provider_name, is_active, created_at')
                .eq('restaurant_id', restaurantId);

            if (error) throw error;
            setKeys(data || []);
        } catch (error) {
            console.error('Error fetching API keys:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddKey = async () => {
        if (!newKey.provider || !newKey.key) {
            toast({
                title: 'Error',
                description: 'Please fill in all fields',
                variant: 'destructive',
            });
            return;
        }

        try {
            // Call Edge Function to encrypt and store key
            const { data: { session } } = await supabase.auth.getSession();

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-key-manager`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({
                        restaurant_id: restaurantId,
                        provider_name: newKey.provider,
                        api_key: newKey.key,
                    }),
                }
            );

            if (!response.ok) throw new Error('Failed to add API key');

            toast({
                title: 'Success',
                description: 'API key added successfully',
            });

            setIsDialogOpen(false);
            setNewKey({ provider: '', key: '' });
            setTestResult(null);
            fetchKeys();
        } catch (error) {
            console.error('Error adding API key:', error);
            toast({
                title: 'Error',
                description: 'Failed to add API key. Make sure the api-key-manager edge function is deployed.',
                variant: 'destructive',
            });
        }
    };

    // Bug Fix #5: Improved key validation with provider-specific format checks
    const handleTestKey = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const key = newKey.key.trim();
            const provider = newKey.provider;

            // Basic length validation
            if (key.length < 10) {
                throw new Error('API key is too short (minimum 10 characters)');
            }

            // Provider-specific format validation
            if (provider === 'openai') {
                if (!key.startsWith('sk-') && !key.startsWith('sk-proj-')) {
                    throw new Error('OpenAI keys should start with "sk-" or "sk-proj-"');
                }
            } else if (provider === 'google') {
                if (key.length < 20) {
                    throw new Error('Google Cloud API keys are typically longer');
                }
            } else if (provider === 'huggingface') {
                if (!key.startsWith('hf_')) {
                    throw new Error('Hugging Face tokens should start with "hf_"');
                }
            }

            // If format checks pass
            setTestResult('success');
            toast({
                title: 'Format Valid',
                description: `Key format matches ${provider} pattern. Save to test live connection.`,
            });
        } catch (error: any) {
            setTestResult('error');
            toast({
                title: 'Validation Failed',
                description: error.message || 'Invalid API key format',
                variant: 'destructive',
            });
        } finally {
            setTesting(false);
        }
    };

    const handleToggleKey = async (keyId: string, currentActive: boolean) => {
        try {
            const { error } = await supabase
                .from('restaurant_api_keys')
                .update({ is_active: !currentActive })
                .eq('id', keyId);

            if (error) throw error;
            toast({ title: currentActive ? 'Key Deactivated' : 'Key Activated' });
            fetchKeys();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update key', variant: 'destructive' });
        }
    };

    const handleDeleteKey = async (keyId: string) => {
        if (!confirm('Are you sure you want to delete this API key? This cannot be undone.')) return;

        try {
            const { error } = await supabase
                .from('restaurant_api_keys')
                .delete()
                .eq('id', keyId);

            if (error) throw error;

            toast({
                title: 'Success',
                description: 'API key deleted successfully',
            });

            fetchKeys();
        } catch (error) {
            console.error('Error deleting API key:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete API key',
                variant: 'destructive',
            });
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Key className="w-5 h-5" />
                            API Keys
                        </CardTitle>
                        <CardDescription>
                            Manage API keys for AI providers. Keys are encrypted at rest.
                        </CardDescription>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Key
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add API Key</DialogTitle>
                                <DialogDescription>
                                    Add an API key for an AI provider. The key will be encrypted before storage.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Provider</Label>
                                    {/* Bug Fix #4: Dynamic provider list from DB */}
                                    <Select
                                        value={newKey.provider}
                                        onValueChange={(value) => setNewKey({ ...newKey, provider: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {providerOptions.length > 0 ? (
                                                providerOptions.map((p) => (
                                                    <SelectItem key={p.provider_name} value={p.provider_name}>
                                                        {p.display_name}
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                /* Bug Fix #11: Show message when no providers */
                                                <div className="p-2 text-xs text-muted-foreground text-center">
                                                    No active providers require API keys
                                                </div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>API Key</Label>
                                    <Input
                                        type="password"
                                        placeholder={
                                            newKey.provider === 'openai' ? 'sk-...' :
                                            newKey.provider === 'huggingface' ? 'hf_...' :
                                            newKey.provider === 'google' ? 'AIza...' :
                                            'Enter API key...'
                                        }
                                        value={newKey.key}
                                        onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                                    />
                                </div>

                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleTestKey}
                                    disabled={testing || !newKey.key || !newKey.provider}
                                >
                                    <Shield className="w-4 h-4 mr-2" />
                                    {testing ? 'Validating...' : 'Validate Format'}
                                </Button>

                                {testResult === 'success' && (
                                    <div className="flex items-center gap-2 text-green-600 text-sm">
                                        <CheckCircle className="w-4 h-4" />
                                        Format valid — save to use
                                    </div>
                                )}

                                {testResult === 'error' && (
                                    <div className="flex items-center gap-2 text-red-600 text-sm">
                                        <XCircle className="w-4 h-4" />
                                        Format validation failed
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAddKey} disabled={!newKey.provider || !newKey.key}>
                                    Save Key
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                ) : keys.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Key className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No API keys configured</p>
                        <p className="text-xs mt-1">Add a key to enable paid AI providers like OpenAI or Google Cloud.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {keys.map((key) => (
                            <div
                                key={key.id}
                                className={`flex items-center justify-between p-3 border rounded-lg transition-opacity ${!key.is_active ? 'opacity-50' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <Key className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium capitalize">{key.provider_name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            Added {new Date(key.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge
                                        variant={key.is_active ? "default" : "secondary"}
                                        className="cursor-pointer"
                                        onClick={() => handleToggleKey(key.id, key.is_active)}
                                    >
                                        {key.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteKey(key.id)}
                                    >
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
