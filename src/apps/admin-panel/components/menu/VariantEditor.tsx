import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GripVertical, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Variant {
    id?: string;
    name: string;
    price_cents: number;
    is_default: boolean;
    sort_order: number;
    is_active: boolean;
}

interface VariantEditorProps {
    menuItemId: string;
    restaurantId: string;
    maxVariants?: number;
}

export function VariantEditor({ menuItemId, restaurantId, maxVariants = 5 }: VariantEditorProps) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [newVariant, setNewVariant] = useState<Omit<Variant, "id" | "sort_order">>({
        name: "",
        price_cents: 0,
        is_default: false,
        is_active: true,
    });

    // Fetch existing variants
    const { data: variants = [], isLoading } = useQuery({
        queryKey: ["menu-item-variants", menuItemId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("menu_item_variants")
                .select("*")
                .eq("menu_item_id", menuItemId)
                .order("sort_order");

            if (error) throw error;
            return data as Variant[];
        },
    });

    // Add variant mutation
    const addMutation = useMutation({
        mutationFn: async (variant: Omit<Variant, "id">) => {
            const { data, error } = await supabase
                .from("menu_item_variants")
                .insert({
                    menu_item_id: menuItemId,
                    restaurant_id: restaurantId,
                    ...variant,
                    sort_order: variants.length,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["menu-item-variants", menuItemId] });
            setNewVariant({ name: "", price_cents: 0, is_default: false, is_active: true });
            toast({ title: "Variant added", description: "Menu item variant created successfully." });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    // Delete variant mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("menu_item_variants")
                .delete()
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["menu-item-variants", menuItemId] });
            toast({ title: "Variant deleted", description: "Variant removed successfully." });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    // Update variant mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Variant> }) => {
            const { error } = await supabase
                .from("menu_item_variants")
                .update(updates)
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["menu-item-variants", menuItemId] });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const handleAddVariant = () => {
        if (!newVariant.name.trim()) {
            toast({ title: "Error", description: "Variant name is required", variant: "destructive" });
            return;
        }

        if (variants.length >= maxVariants) {
            toast({
                title: "Limit Reached",
                description: `Maximum ${maxVariants} variants allowed per item.`,
                variant: "destructive"
            });
            return;
        }

        addMutation.mutate(newVariant as Omit<Variant, "id">);
    };

    const toggleDefault = (id: string) => {
        // First, unset all defaults
        variants.forEach((v) => {
            if (v.id && v.is_default) {
                updateMutation.mutate({ id: v.id, updates: { is_default: false } });
            }
        });
        // Then set the new default
        updateMutation.mutate({ id, updates: { is_default: true } });
    };

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading variants...</div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Size Variants</CardTitle>
                <CardDescription>
                    Add different sizes or variants (e.g., Small, Medium, Large). Max {maxVariants} variants.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Existing Variants */}
                <div className="space-y-2">
                    {variants.map((variant) => (
                        <div
                            key={variant.id}
                            className={cn(
                                "flex items-center gap-3 p-3 border rounded-lg",
                                !variant.is_active && "opacity-50"
                            )}
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />

                            <div className="flex-1 grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-sm font-medium">{variant.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        ${(variant.price_cents / 100).toFixed(2)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <Button
                                        variant={variant.is_default ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => variant.id && toggleDefault(variant.id)}
                                    >
                                        <Star className={cn("h-3 w-3", variant.is_default && "fill-current")} />
                                        {variant.is_default && <span className="ml-1 text-xs">Default</span>}
                                    </Button>

                                    <Switch
                                        checked={variant.is_active}
                                        onCheckedChange={(checked) =>
                                            variant.id && updateMutation.mutate({ id: variant.id, updates: { is_active: checked } })
                                        }
                                    />

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => variant.id && deleteMutation.mutate(variant.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {variants.length === 0 && (
                        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                            No variants added yet
                        </div>
                    )}
                </div>

                {/* Add New Variant */}
                {variants.length < maxVariants && (
                    <div className="border-t pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Variant Name</Label>
                                <Input
                                    placeholder="e.g., Small, Medium, Large"
                                    value={newVariant.name}
                                    onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Price ($)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={newVariant.price_cents / 100}
                                    onChange={(e) =>
                                        setNewVariant({ ...newVariant, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
                                    }
                                />
                            </div>
                        </div>

                        <Button
                            onClick={handleAddVariant}
                            disabled={addMutation.isPending}
                            className="w-full"
                            variant="outline"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Variant
                        </Button>
                    </div>
                )}

                {variants.length >= maxVariants && (
                    <div className="text-xs text-muted-foreground text-center p-2 bg-muted rounded">
                        Maximum {maxVariants} variants reached. Increase limit in Branding settings.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
