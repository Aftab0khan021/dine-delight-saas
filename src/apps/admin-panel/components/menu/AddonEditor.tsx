import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Addon {
    id?: string;
    name: string;
    price_cents: number;
    is_mandatory: boolean;
    max_quantity: number;
    sort_order: number;
    is_active: boolean;
}

interface AddonEditorProps {
    menuItemId: string;
    restaurantId: string;
}

export function AddonEditor({ menuItemId, restaurantId }: AddonEditorProps) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [newAddon, setNewAddon] = useState<Omit<Addon, "id" | "sort_order">>({
        name: "",
        price_cents: 0,
        is_mandatory: false,
        max_quantity: 1,
        is_active: true,
    });

    // Fetch existing add-ons
    const { data: addons = [], isLoading } = useQuery({
        queryKey: ["menu-item-addons", menuItemId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("menu_item_addons")
                .select("*")
                .eq("menu_item_id", menuItemId)
                .order("sort_order");

            if (error) throw error;
            return data as Addon[];
        },
    });

    // Add add-on mutation
    const addMutation = useMutation({
        mutationFn: async (addon: Omit<Addon, "id">) => {
            const { data, error } = await supabase
                .from("menu_item_addons")
                .insert({
                    menu_item_id: menuItemId,
                    restaurant_id: restaurantId,
                    ...addon,
                    sort_order: addons.length,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["menu-item-addons", menuItemId] });
            setNewAddon({ name: "", price_cents: 0, is_mandatory: false, max_quantity: 1, is_active: true });
            toast({ title: "Add-on created", description: "Menu item add-on added successfully." });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    // Delete add-on mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("menu_item_addons")
                .delete()
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["menu-item-addons", menuItemId] });
            toast({ title: "Add-on deleted", description: "Add-on removed successfully." });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    // Update add-on mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Addon> }) => {
            const { error } = await supabase
                .from("menu_item_addons")
                .update(updates)
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["menu-item-addons", menuItemId] });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const handleAddAddon = () => {
        if (!newAddon.name.trim()) {
            toast({ title: "Error", description: "Add-on name is required", variant: "destructive" });
            return;
        }

        addMutation.mutate(newAddon as Omit<Addon, "id">);
    };

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading add-ons...</div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Add-ons & Extras</CardTitle>
                <CardDescription>
                    Add customization options like toppings, extra cheese, etc.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Existing Add-ons */}
                <div className="space-y-2">
                    {addons.map((addon) => (
                        <div
                            key={addon.id}
                            className={cn(
                                "flex items-start gap-3 p-3 border rounded-lg",
                                !addon.is_active && "opacity-50"
                            )}
                        >
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium flex items-center gap-2">
                                            {addon.name}
                                            {addon.is_mandatory && (
                                                <Badge variant="secondary" className="text-xs">
                                                    <AlertCircle className="h-3 w-3 mr-1" />
                                                    Required
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            +${(addon.price_cents / 100).toFixed(2)}
                                            {addon.max_quantity > 0 && ` • Max ${addon.max_quantity}`}
                                            {addon.max_quantity === 0 && ` • Unlimited`}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={addon.is_active}
                                            onCheckedChange={(checked) =>
                                                addon.id && updateMutation.mutate({ id: addon.id, updates: { is_active: checked } })
                                            }
                                        />

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => addon.id && deleteMutation.mutate(addon.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                    <Label className="flex items-center gap-2 cursor-pointer">
                                        <Switch
                                            checked={addon.is_mandatory}
                                            onCheckedChange={(checked) =>
                                                addon.id && updateMutation.mutate({ id: addon.id, updates: { is_mandatory: checked } })
                                            }
                                            className="scale-75"
                                        />
                                        <span className="text-muted-foreground">Mandatory</span>
                                    </Label>
                                </div>
                            </div>
                        </div>
                    ))}

                    {addons.length === 0 && (
                        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                            No add-ons configured yet
                        </div>
                    )}
                </div>

                {/* Add New Add-on */}
                <div className="border-t pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Add-on Name</Label>
                            <Input
                                placeholder="e.g., Extra Cheese, Jalapeños"
                                value={newAddon.name}
                                onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Price ($)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={newAddon.price_cents / 100}
                                onChange={(e) =>
                                    setNewAddon({ ...newAddon, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
                                }
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Max Quantity (0 = unlimited)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={newAddon.max_quantity}
                                onChange={(e) => setNewAddon({ ...newAddon, max_quantity: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="flex items-end pb-2">
                            <Label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                    checked={newAddon.is_mandatory}
                                    onCheckedChange={(checked) => setNewAddon({ ...newAddon, is_mandatory: checked })}
                                />
                                <span>Mandatory</span>
                            </Label>
                        </div>
                    </div>

                    <Button
                        onClick={handleAddAddon}
                        disabled={addMutation.isPending}
                        className="w-full"
                        variant="outline"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Add-on
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
