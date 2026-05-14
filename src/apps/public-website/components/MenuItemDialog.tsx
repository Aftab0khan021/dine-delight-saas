
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Minus, Plus, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/formatting";

type MenuItemDialogProps = {
    item: any | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddToCart: (cartItem: any) => void;
    restaurantId: string;
    themeColor?: string;
    currencyCode?: string;
};

export function MenuItemDialog({ item, open, onOpenChange, onAddToCart, restaurantId, themeColor = "#000", currencyCode = "INR" }: MenuItemDialogProps) {
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
                .select("id, name, price_cents, sort_order, is_active, is_default")
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
                .select("id, name, price_cents, sort_order, is_active, is_mandatory")
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

        // Validate mandatory addons
        const mandatoryAddons = addons.filter((a: any) => a.is_mandatory);
        const missingMandatory = mandatoryAddons.filter((a: any) => !selectedAddons.has(a.id));
        if (missingMandatory.length > 0) {
            toast({
                title: "Required add-ons missing",
                description: `Please select: ${missingMandatory.map((a: any) => a.name).join(", ")}`,
                variant: "destructive",
            });
            return;
        }

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
                    <div className="flex items-start justify-between gap-2">
                        <DialogTitle>{item.name}</DialogTitle>
                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" title="Share" onClick={async () => {
                            const shareData = { title: item.name, text: `Check out ${item.name}!`, url: window.location.href };
                            if (navigator.share) { try { await navigator.share(shareData); } catch {} }
                            else { await navigator.clipboard.writeText(window.location.href); toast({ title: "Link copied!" }); }
                        }}>
                            <Share2 className="h-4 w-4" />
                        </Button>
                    </div>
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                </DialogHeader>

                {/* P2: Item image(s) carousel */}
                {(() => {
                    const images: string[] = [
                        item.image_url,
                        ...((item as any).additional_images || []),
                    ].filter(Boolean);
                    if (images.length === 0) return null;
                    return (
                        <div className="rounded-lg overflow-hidden border bg-muted -mt-2 relative">
                            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {images.map((src, idx) => (
                                    <img key={idx} src={src} alt={`${item.name} photo ${idx + 1}`} className="w-full h-48 object-cover shrink-0 snap-center" />
                                ))}
                            </div>
                            {images.length > 1 && (
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                    {images.map((_: string, idx: number) => (
                                        <span key={idx} className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}

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
                                            <span className="text-sm">{formatMoney(v.price_cents, currencyCode)}</span>
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
                                                <Label htmlFor={addon.id} className="font-medium cursor-pointer">
                                                    {addon.name}
                                                    {addon.is_mandatory && <span className="ml-1.5 text-[10px] font-semibold text-destructive">Required</span>}
                                                </Label>
                                            </div>
                                            <span className="text-sm">+{formatMoney(addon.price_cents, currencyCode)}</span>
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
                        Add for {formatMoney(totalPriceCents, currencyCode)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
