
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type MenuItemDialogProps = {
    item: any | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddToCart: (cartItem: any) => void;
    restaurantId: string;
    themeColor?: string;
};

// Helpers
function formatMoney(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function MenuItemDialog({ item, open, onOpenChange, onAddToCart, restaurantId, themeColor = "#000" }: MenuItemDialogProps) {
    const { toast } = useToast();
    const [quantity, setQuantity] = useState(1);
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
    const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState("");

    // Queries
    const { data: variants = [], isLoading: loadingVariants } = useQuery({
        queryKey: ["public", "variants", item?.id],
        enabled: !!item?.id && open,
        queryFn: async () => {
            const { data } = await supabase
                .from("menu_item_variants")
                .select("*")
                .eq("menu_item_id", item.id)
                .eq("is_active", true)
                .order("sort_order");
            return data || [];
        }
    });

    const { data: addons = [], isLoading: loadingAddons } = useQuery({
        queryKey: ["public", "addons", item?.id],
        enabled: !!item?.id && open,
        queryFn: async () => {
            const { data } = await supabase
                .from("menu_item_addons")
                .select("*")
                .eq("menu_item_id", item.id)
                .eq("is_active", true)
                .order("sort_order");
            return data || [];
        }
    });

    // Set default variant
    useEffect(() => {
        if (open && variants.length > 0 && !selectedVariantId) {
            const def = variants.find((v: any) => v.is_default);
            if (def) setSelectedVariantId(def.id);
            else setSelectedVariantId(variants[0].id);
        }
    }, [open, variants, selectedVariantId]);

    // Reset on open
    useEffect(() => {
        if (open) {
            setQuantity(1);
            setSelectedAddons(new Set());
            setNotes("");
            setSelectedVariantId(null);
        }
    }, [open, item]);

    // Calculate Price
    const totalPriceCents = useMemo(() => {
        if (!item) return 0;
        let base = item.price_cents;

        // Variant overrides base price
        if (selectedVariantId && variants.length > 0) {
            const v = variants.find((v: any) => v.id === selectedVariantId);
            if (v) base = v.price_cents;
        }

        // Addons add to price
        let addonsTotal = 0;
        selectedAddons.forEach(id => {
            const a = addons.find((a: any) => a.id === id);
            if (a) addonsTotal += a.price_cents;
        });

        return (base + addonsTotal) * quantity;
    }, [item, selectedVariantId, selectedAddons, variants, addons, quantity]);

    const handleAddToCart = () => {
        if (!item) return;

        // Validation?
        // TODO: Validate mandatory addons if implemented

        // Prepare payload
        let finalPrice = item.price_cents;
        let variantName = undefined;

        if (selectedVariantId) {
            const v = variants.find((v: any) => v.id === selectedVariantId);
            if (v) {
                finalPrice = v.price_cents;
                variantName = v.name;
            }
        }

        const addonList = Array.from(selectedAddons).map(id => {
            const a = addons.find((a: any) => a.id === id);
            return a ? { id: a.id, name: a.name, price_cents: a.price_cents } : null;
        }).filter(Boolean);

        // Add addon prices to unit price
        const unitPrice = finalPrice + addonList.reduce((sum, a) => sum + (a?.price_cents || 0), 0);

        onAddToCart({
            menu_item_id: item.id,
            name: item.name,
            price_cents: unitPrice,
            quantity,
            variant_id: selectedVariantId,
            variant_name: variantName,
            addons: addonList,
            notes: notes.trim()
        });

        onOpenChange(false);
    };

    const toggleAddon = (id: string) => {
        const next = new Set(selectedAddons);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedAddons(next);
    };

    if (!item) return null;

    const isLoading = loadingVariants || loadingAddons;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{item.name}</DialogTitle>
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="space-y-6 py-4">

                        {/* Variants */}
                        {variants.length > 0 && (
                            <div className="space-y-3">
                                <Label className="text-base font-semibold">Choose Size</Label>
                                <RadioGroup value={selectedVariantId || ""} onValueChange={setSelectedVariantId}>
                                    {variants.map((v: any) => (
                                        <div key={v.id} className="flex items-center justify-between space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50" onClick={() => setSelectedVariantId(v.id)}>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value={v.id} id={v.id} />
                                                <Label htmlFor={v.id} className="font-medium cursor-pointer">{v.name}</Label>
                                            </div>
                                            <span className="text-sm">{formatMoney(v.price_cents)}</span>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                        )}

                        {/* Add-ons */}
                        {addons.length > 0 && (
                            <div className="space-y-3">
                                <Label className="text-base font-semibold">Add-ons</Label>
                                <div className="space-y-2">
                                    {addons.map((addon: any) => (
                                        <div key={addon.id} className="flex items-center justify-between space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50" onClick={() => toggleAddon(addon.id)}>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox checked={selectedAddons.has(addon.id)} id={addon.id} />
                                                <Label htmlFor={addon.id} className="font-medium cursor-pointer">{addon.name}</Label>
                                            </div>
                                            <span className="text-sm">+{formatMoney(addon.price_cents)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quantity */}
                        <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl">
                            <span className="font-semibold">Quantity</span>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}>
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <span className="font-mono w-6 text-center text-lg">{quantity}</span>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQuantity(q => q + 1)}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Special Instructions</Label>
                            <Textarea
                                id="notes"
                                placeholder="E.g. No onions, extra spicy..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="resize-none"
                            />
                        </div>

                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button className="w-full text-lg h-12 font-bold" onClick={handleAddToCart} style={{ backgroundColor: themeColor }}>
                        Add for {formatMoney(totalPriceCents)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
