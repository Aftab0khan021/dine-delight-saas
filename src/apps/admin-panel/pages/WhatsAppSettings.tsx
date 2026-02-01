import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, Settings, BarChart3, MessageCircle, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function WhatsAppSettings() {
    const { restaurant } = useRestaurantContext();
    const { toast } = useToast();
    const qc = useQueryClient();

    // Fetch restaurant WhatsApp config
    const { data: config, isLoading } = useQuery({
        queryKey: ["restaurant", restaurant?.id, "whatsapp-config"],
        enabled: !!restaurant?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("restaurants")
                .select("whatsapp_config")
                .eq("id", restaurant!.id)
                .single();

            if (error) throw error;
            return data.whatsapp_config || {
                enabled: false,
                auto_reply_enabled: true,
                greeting_message: "Welcome! How can I help you today?"
            };
        }
    });

    // Fetch conversation stats
    const { data: stats } = useQuery({
        queryKey: ["restaurant", restaurant?.id, "whatsapp-stats"],
        enabled: !!restaurant?.id,
        queryFn: async () => {
            const { data: conversations, error: convError } = await supabase
                .from("whatsapp_conversations")
                .select("id, is_active, created_at")
                .eq("restaurant_id", restaurant!.id);

            if (convError) throw convError;

            const { data: orders, error: ordersError } = await supabase
                .from("whatsapp_orders")
                .select("id, created_at, order_id(total_cents)")
                .in("conversation_id", conversations.map(c => c.id));

            if (ordersError) throw ordersError;

            const totalRevenue = orders?.reduce((sum, o: any) => sum + (o.order_id?.total_cents || 0), 0) || 0;

            return {
                totalConversations: conversations?.length || 0,
                activeConversations: conversations?.filter(c => c.is_active).length || 0,
                totalOrders: orders?.length || 0,
                totalRevenue: totalRevenue
            };
        }
    });

    // Fetch menu items for WhatsApp visibility control
    const { data: menuItems } = useQuery({
        queryKey: ["restaurant", restaurant?.id, "menu-items-whatsapp"],
        enabled: !!restaurant?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("menu_items")
                .select("id, name, category_id, show_in_whatsapp, is_active, categories(name)")
                .eq("restaurant_id", restaurant!.id)
                .order("name");

            if (error) throw error;
            return data;
        }
    });

    // Form state
    const [formData, setFormData] = useState({
        auto_reply_enabled: true,
        greeting_message: "Welcome! How can I help you today?"
    });

    // Update form when config loads
    useEffect(() => {
        if (config) {
            setFormData({
                auto_reply_enabled: config.auto_reply_enabled ?? true,
                greeting_message: config.greeting_message || "Welcome! How can I help you today?"
            });
        }
    }, [config]);

    // Save configuration
    const saveMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const { error } = await supabase
                .from("restaurants")
                .update({
                    whatsapp_config: {
                        ...config,
                        ...data
                    }
                })
                .eq("id", restaurant!.id);

            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["restaurant", restaurant?.id, "whatsapp-config"] });
            toast({
                title: "Settings saved",
                description: "WhatsApp configuration updated successfully"
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to save",
                description: error.message,
                variant: "destructive"
            });
        }
    });

    // Toggle menu item visibility in WhatsApp
    const toggleMenuItemVisibility = useMutation({
        mutationFn: async ({ itemId, visible }: { itemId: string; visible: boolean }) => {
            const { error } = await supabase
                .from("menu_items")
                .update({ show_in_whatsapp: visible })
                .eq("id", itemId);

            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["restaurant", restaurant?.id, "menu-items-whatsapp"] });
            toast({
                title: "Updated",
                description: "Menu item visibility updated"
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to update",
                description: error.message,
                variant: "destructive"
            });
        }
    });

    const handleSave = () => {
        saveMutation.mutate(formData);
    };

    const isConfigured = !!(config?.phone_number_id && config?.access_token);
    const isEnabled = config?.enabled || false;

    if (isLoading) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">WhatsApp Bot</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your WhatsApp ordering bot settings and conversations
                </p>
            </div>

            {/* Status Alert */}
            {isEnabled && isConfigured ? (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 dark:text-green-200">WhatsApp Bot Active</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-300">
                        Your WhatsApp bot is enabled and ready to receive orders.
                    </AlertDescription>
                </Alert>
            ) : !isConfigured ? (
                <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <AlertTitle className="text-orange-800 dark:text-orange-200">Configuration Required</AlertTitle>
                    <AlertDescription className="text-orange-700 dark:text-orange-300">
                        Contact your Super Admin to configure WhatsApp credentials for your restaurant.
                    </AlertDescription>
                </Alert>
            ) : (
                <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>WhatsApp Bot Disabled</AlertTitle>
                    <AlertDescription>
                        Contact your Super Admin to enable the WhatsApp bot for your restaurant.
                    </AlertDescription>
                </Alert>
            )}

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Conversations
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalConversations || 0}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Active Chats
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.activeConversations || 0}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Orders via WhatsApp
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${((stats?.totalRevenue || 0) / 100).toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="settings" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="settings">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </TabsTrigger>
                    <TabsTrigger value="menu">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Menu Visibility
                    </TabsTrigger>
                    <TabsTrigger value="conversations">
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Conversations
                    </TabsTrigger>
                </TabsList>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Bot Configuration</CardTitle>
                            <CardDescription>
                                Customize your WhatsApp bot behavior and messages
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Auto Reply */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Auto-Reply</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Automatically respond to customer messages
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.auto_reply_enabled}
                                    onCheckedChange={(checked) => setFormData({ ...formData, auto_reply_enabled: checked })}
                                    disabled={!isConfigured}
                                />
                            </div>

                            {/* Greeting Message */}
                            <div className="space-y-2">
                                <Label htmlFor="greeting">Greeting Message</Label>
                                <Textarea
                                    id="greeting"
                                    rows={3}
                                    placeholder="Welcome! How can I help you today?"
                                    value={formData.greeting_message}
                                    onChange={(e) => setFormData({ ...formData, greeting_message: e.target.value })}
                                    disabled={!isConfigured}
                                />
                                <p className="text-xs text-muted-foreground">
                                    This message will be sent when a customer first contacts your restaurant
                                </p>
                            </div>

                            {/* Save Button */}
                            <Button onClick={handleSave} disabled={saveMutation.isPending || !isConfigured}>
                                {saveMutation.isPending ? "Saving..." : "Save Settings"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Menu Visibility Tab */}
                <TabsContent value="menu" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Menu Items Visibility</CardTitle>
                            <CardDescription>
                                Control which menu items appear in the WhatsApp bot
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item Name</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Show in WhatsApp</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {menuItems?.map((item: any) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.categories?.name || 'Uncategorized'}</TableCell>
                                            <TableCell>
                                                {item.is_active ? (
                                                    <Badge variant="default" className="bg-green-500">Active</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Inactive</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={item.show_in_whatsapp}
                                                    onCheckedChange={(checked) =>
                                                        toggleMenuItemVisibility.mutate({ itemId: item.id, visible: checked })
                                                    }
                                                    disabled={!item.is_active || !isConfigured}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {(!menuItems || menuItems.length === 0) && (
                                <div className="text-center py-6 text-muted-foreground">
                                    No menu items found. Add menu items to control their WhatsApp visibility.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Conversations Tab */}
                <TabsContent value="conversations">
                    <ConversationsView restaurantId={restaurant?.id} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

// Conversations View Component
function ConversationsView({ restaurantId }: { restaurantId?: string }) {
    const { data: conversations, isLoading } = useQuery({
        queryKey: ["whatsapp-conversations", restaurantId],
        enabled: !!restaurantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("whatsapp_conversations")
                .select(`
          id,
          state,
          is_active,
          last_message_at,
          created_at,
          whatsapp_customer_id (
            phone_number,
            name
          )
        `)
                .eq("restaurant_id", restaurantId!)
                .order("last_message_at", { ascending: false })
                .limit(20);

            if (error) throw error;
            return data;
        }
    });

    if (isLoading) {
        return <Card><CardContent className="p-6">Loading conversations...</CardContent></Card>;
    }

    if (!conversations || conversations.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                    No conversations yet. Start by sending a message to your WhatsApp number!
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Conversations</CardTitle>
                <CardDescription>View and manage customer conversations</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {conversations.map((conv: any) => (
                        <div
                            key={conv.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                        {conv.whatsapp_customer_id?.name || conv.whatsapp_customer_id?.phone_number}
                                    </span>
                                    {conv.is_active && (
                                        <Badge variant="default" className="text-xs">Active</Badge>
                                    )}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                    State: {conv.state} • Last message: {new Date(conv.last_message_at).toLocaleString()}
                                </div>
                            </div>
                            <Button variant="outline" size="sm">
                                View
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
