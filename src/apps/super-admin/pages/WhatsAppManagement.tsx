import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Send, CheckCircle2, XCircle, Loader2, Settings2, Copy, AlertCircle } from 'lucide-react';

interface Restaurant {
    id: string;
    name: string;
    whatsapp_config: {
        enabled: boolean;
        phone_number_id?: string;
        business_account_id?: string;
        access_token?: string;
        webhook_verify_token?: string;
        greeting_message?: string;
    };
}

export default function WhatsAppManagement() {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [testMessage, setTestMessage] = useState('');
    const [sending, setSending] = useState(false);
    const { toast } = useToast();

    // Configuration form state
    const [configForm, setConfigForm] = useState({
        phone_number_id: '',
        access_token: '',
        webhook_verify_token: 'dine-delight-verify-token',
        enabled: false,
    });

    useEffect(() => {
        fetchRestaurants();
    }, []);

    const fetchRestaurants = async () => {
        try {
            const { data, error } = await supabase
                .from('restaurants')
                .select('id, name, whatsapp_config')
                .order('name');

            if (error) throw error;
            setRestaurants(data || []);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const openConfigModal = (restaurant: Restaurant) => {
        setSelectedRestaurant(restaurant);
        setConfigForm({
            phone_number_id: restaurant.whatsapp_config?.phone_number_id || '',
            access_token: restaurant.whatsapp_config?.access_token || '',
            webhook_verify_token: restaurant.whatsapp_config?.webhook_verify_token || 'dine-delight-verify-token',
            enabled: restaurant.whatsapp_config?.enabled || false,
        });
        setConfigModalOpen(true);
    };

    const saveConfiguration = async () => {
        if (!selectedRestaurant) return;

        try {
            const { error } = await supabase
                .from('restaurants')
                .update({
                    whatsapp_config: {
                        ...selectedRestaurant.whatsapp_config,
                        ...configForm,
                    },
                })
                .eq('id', selectedRestaurant.id);

            if (error) throw error;

            toast({
                title: 'Success',
                description: `WhatsApp configuration updated for ${selectedRestaurant.name}`,
            });

            setConfigModalOpen(false);
            fetchRestaurants();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const toggleWhatsApp = async (restaurantId: string, enabled: boolean) => {
        try {
            const restaurant = restaurants.find(r => r.id === restaurantId);
            if (!restaurant) return;

            // Check if configured before enabling
            if (enabled && (!restaurant.whatsapp_config?.phone_number_id || !restaurant.whatsapp_config?.access_token)) {
                toast({
                    title: 'Configuration Required',
                    description: 'Please configure Phone Number ID and Access Token first',
                    variant: 'destructive',
                });
                return;
            }

            const { error } = await supabase
                .from('restaurants')
                .update({
                    whatsapp_config: {
                        ...restaurant.whatsapp_config,
                        enabled: enabled,
                    },
                })
                .eq('id', restaurantId);

            if (error) throw error;

            toast({
                title: 'Success',
                description: `WhatsApp ${enabled ? 'enabled' : 'disabled'} for ${restaurant.name}`,
            });

            fetchRestaurants();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const sendTestMessage = async () => {
        if (!selectedRestaurant || !testPhone || !testMessage) {
            toast({
                title: 'Error',
                description: 'Please fill all fields',
                variant: 'destructive',
            });
            return;
        }

        setSending(true);
        try {
            const restaurant = restaurants.find(r => r.id === selectedRestaurant.id);
            if (!restaurant?.whatsapp_config?.access_token || !restaurant?.whatsapp_config?.phone_number_id) {
                throw new Error('WhatsApp not configured for this restaurant');
            }

            const response = await fetch(
                `https://graph.facebook.com/v18.0/${restaurant.whatsapp_config.phone_number_id}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${restaurant.whatsapp_config.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to: testPhone.replace(/[^0-9]/g, ''),
                        type: 'text',
                        text: { body: testMessage },
                    }),
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Failed to send message');
            }

            toast({
                title: 'Success',
                description: 'Test message sent successfully!',
            });

            setTestMessage('');
            setTestPhone('');
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setSending(false);
        }
    };

    const webhookUrl = `https://itxbbdvqopfmuvwxxmtk.supabase.co/functions/v1/whatsapp-webhook`;

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copied!',
            description: `${label} copied to clipboard`,
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold">WhatsApp Management</h1>
                <p className="text-muted-foreground">Configure WhatsApp bot credentials for all restaurants</p>
            </div>

            <Tabs defaultValue="restaurants" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="restaurants">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Restaurants
                    </TabsTrigger>
                    <TabsTrigger value="test">
                        <Send className="h-4 w-4 mr-2" />
                        Test Messages
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="restaurants" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Restaurant WhatsApp Status</CardTitle>
                            <CardDescription>
                                Configure credentials and enable/disable WhatsApp bot for each restaurant
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Restaurant</TableHead>
                                        <TableHead>Phone Number ID</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Configured</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {restaurants.map((restaurant) => {
                                        const config = restaurant.whatsapp_config || {};
                                        const isConfigured = !!(config.phone_number_id && config.access_token);

                                        return (
                                            <TableRow key={restaurant.id}>
                                                <TableCell className="font-medium">{restaurant.name}</TableCell>
                                                <TableCell>
                                                    {config.phone_number_id ? (
                                                        <code className="text-xs bg-muted px-2 py-1 rounded">
                                                            {config.phone_number_id}
                                                        </code>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">Not set</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {config.enabled ? (
                                                        <Badge variant="default" className="bg-green-500">
                                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                                            Active
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary">
                                                            <XCircle className="h-3 w-3 mr-1" />
                                                            Inactive
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isConfigured ? (
                                                        <Badge variant="outline" className="text-green-600 border-green-600">
                                                            Yes
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                                                            No
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => openConfigModal(restaurant)}
                                                        >
                                                            <Settings2 className="h-4 w-4 mr-1" />
                                                            Configure
                                                        </Button>
                                                        <Switch
                                                            checked={config.enabled || false}
                                                            onCheckedChange={(checked) => toggleWhatsApp(restaurant.id, checked)}
                                                            disabled={!isConfigured}
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="test" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Send Test Message</CardTitle>
                            <CardDescription>
                                Test WhatsApp integration by sending a message
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="restaurant">Select Restaurant</Label>
                                <select
                                    id="restaurant"
                                    className="w-full p-2 border rounded-md"
                                    value={selectedRestaurant?.id || ''}
                                    onChange={(e) => {
                                        const restaurant = restaurants.find(r => r.id === e.target.value);
                                        setSelectedRestaurant(restaurant || null);
                                    }}
                                >
                                    <option value="">Choose a restaurant...</option>
                                    {restaurants
                                        .filter(r => r.whatsapp_config?.enabled && r.whatsapp_config?.phone_number_id)
                                        .map((restaurant) => (
                                            <option key={restaurant.id} value={restaurant.id}>
                                                {restaurant.name}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number (with country code)</Label>
                                <Input
                                    id="phone"
                                    placeholder="+1234567890"
                                    value={testPhone}
                                    onChange={(e) => setTestPhone(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message">Message</Label>
                                <Textarea
                                    id="message"
                                    placeholder="Enter your test message..."
                                    value={testMessage}
                                    onChange={(e) => setTestMessage(e.target.value)}
                                    rows={4}
                                />
                            </div>

                            <Button
                                onClick={sendTestMessage}
                                disabled={sending || !selectedRestaurant || !testPhone || !testMessage}
                                className="w-full"
                            >
                                {sending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Send Test Message
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Configuration Modal */}
            <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Configure WhatsApp for {selectedRestaurant?.name}</DialogTitle>
                        <DialogDescription>
                            Set up WhatsApp Business API credentials for this restaurant
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone_number_id">Phone Number ID *</Label>
                            <Input
                                id="phone_number_id"
                                placeholder="123456789012345"
                                value={configForm.phone_number_id}
                                onChange={(e) => setConfigForm({ ...configForm, phone_number_id: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Found in Meta Developer Console → WhatsApp → API Setup
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="access_token">Access Token *</Label>
                            <Input
                                id="access_token"
                                type="password"
                                placeholder="EAAxxxxxxxxxxxxxxx"
                                value={configForm.access_token}
                                onChange={(e) => setConfigForm({ ...configForm, access_token: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Generate a permanent token in Meta Business Settings → System Users
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="webhook_verify_token">Webhook Verify Token</Label>
                            <Input
                                id="webhook_verify_token"
                                value={configForm.webhook_verify_token}
                                onChange={(e) => setConfigForm({ ...configForm, webhook_verify_token: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Use this token when configuring the webhook in Meta Console
                            </p>
                        </div>

                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Webhook URL</AlertTitle>
                            <AlertDescription>
                                <div className="flex items-center gap-2 mt-2">
                                    <code className="flex-1 text-xs bg-muted px-2 py-1 rounded">
                                        {webhookUrl}
                                    </code>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
                                    >
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                </div>
                            </AlertDescription>
                        </Alert>

                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                                <Label>Enable WhatsApp Bot</Label>
                                <p className="text-sm text-muted-foreground">
                                    Allow customers to place orders via WhatsApp
                                </p>
                            </div>
                            <Switch
                                checked={configForm.enabled}
                                onCheckedChange={(checked) => setConfigForm({ ...configForm, enabled: checked })}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfigModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveConfiguration}>
                            Save Configuration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
