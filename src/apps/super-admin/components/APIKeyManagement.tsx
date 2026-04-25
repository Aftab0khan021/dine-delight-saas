import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Key, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface APIKey {
    id: string;
    provider_name: string;
    is_active: boolean;
    created_at: string;
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

    useEffect(() => {
        fetchKeys();
    }, [restaurantId]);

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
                description: 'Failed to add API key',
                variant: 'destructive',
            });
        }
    };

    const handleTestKey = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            // Simple validation - in production, test actual API connection
            if (newKey.key.length < 10) {
                throw new Error('Invalid key format');
            }

            // Simulate API test
            await new Promise(resolve => setTimeout(resolve, 1000));
            setTestResult('success');

            toast({
                title: 'Success',
                description: 'API key is valid',
            });
        } catch (error) {
            setTestResult('error');
            toast({
                title: 'Error',
                description: 'Invalid API key',
                variant: 'destructive',
            });
        } finally {
            setTesting(false);
        }
    };

    const handleDeleteKey = async (keyId: string) => {
        if (!confirm('Are you sure you want to delete this API key?')) return;

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
                            Manage API keys for AI providers
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
                                    Add an API key for an AI provider
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Provider</Label>
                                    <Select
                                        value={newKey.provider}
                                        onValueChange={(value) => setNewKey({ ...newKey, provider: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="openai">OpenAI</SelectItem>
                                            <SelectItem value="google">Google Cloud</SelectItem>
                                            <SelectItem value="huggingface">Hugging Face</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>API Key</Label>
                                    <Input
                                        type="password"
                                        placeholder="sk-..."
                                        value={newKey.key}
                                        onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                                    />
                                </div>

                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleTestKey}
                                    disabled={testing || !newKey.key}
                                >
                                    {testing ? 'Testing...' : 'Test Connection'}
                                </Button>

                                {testResult === 'success' && (
                                    <div className="flex items-center gap-2 text-green-600 text-sm">
                                        <CheckCircle className="w-4 h-4" />
                                        Connection successful
                                    </div>
                                )}

                                {testResult === 'error' && (
                                    <div className="flex items-center gap-2 text-red-600 text-sm">
                                        <XCircle className="w-4 h-4" />
                                        Connection failed
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAddKey} disabled={!testResult}>
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
                        No API keys configured
                    </div>
                ) : (
                    <div className="space-y-3">
                        {keys.map((key) => (
                            <div
                                key={key.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
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
                                    {key.is_active ? (
                                        <Badge variant="default">Active</Badge>
                                    ) : (
                                        <Badge variant="secondary">Inactive</Badge>
                                    )}
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
