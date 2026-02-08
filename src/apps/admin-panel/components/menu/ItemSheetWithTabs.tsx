// Helper function for currency examples
function getCurrencyExample(currencyCode: string = 'INR') {
    const examples: Record<string, { amount: number; symbol: string }> = {
        'INR': { amount: 10000, symbol: '₹' },
        'USD': { amount: 1000, symbol: '$' },
        'EUR': { amount: 1000, symbol: '€' },
        'GBP': { amount: 1000, symbol: '£' },
        'AUD': { amount: 1000, symbol: 'A$' },
        'CAD': { amount: 1000, symbol: 'C$' },
        'SGD': { amount: 1000, symbol: 'S$' },
        'AED': { amount: 1000, symbol: 'د.إ' },
        'JPY': { amount: 1000, symbol: '¥' },
        'CNY': { amount: 1000, symbol: '¥' },
    };
    const ex = examples[currencyCode] || examples['INR'];
    return `${ex.amount} = ${ex.symbol}${(ex.amount / 100).toFixed(2)}`;
}

// --- Subcomponent: Item Sheet with Tabs ---
function ItemSheet({ open, onOpenChange, data, categories, restaurantId, onSave, onDelete }: any) {
    const form = useForm();
    const [uploading, setUploading] = useState(false);

    // Fetch restaurant currency
    const { data: restaurantData } = useQuery({
        queryKey: ['restaurant', restaurantId],
        enabled: !!restaurantId,
        queryFn: async () => {
            const { data } = await supabase
                .from('restaurants')
                .select('currency_code')
                .eq('id', restaurantId)
                .single();
            return data;
        }
    });

    const currencyCode = restaurantData?.currency_code || 'INR';

    const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];
        const fileExt = file.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        setUploading(true);
        try {
            const { error } = await supabase.storage.from("menu-items").upload(fileName, file, { upsert: true });
            if (error) throw error;
            const { data } = supabase.storage.from("menu-items").getPublicUrl(fileName);
            form.setValue("image_url", data.publicUrl, { shouldDirty: true });
        } finally {
            setUploading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];
        const fileExt = file.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        setUploading(true);
        try {
            const { error } = await supabase.storage.from("menu-items").upload(fileName, file);
            if (error) throw error;
            const { data } = supabase.storage.from("menu-items").getPublicUrl(fileName);
            form.setValue("image_url", data.publicUrl, { shouldDirty: true });
        } finally {
            setUploading(false);
        }
    };

    useMemo(() => {
        if (open) {
            form.reset({
                name: data?.name || "",
                description: data?.description || "",
                price_cents: data?.price_cents || 0,
                category_id: data?.category_id || (categories.length > 0 ? categories[0].id : ""),
                image_url: data?.image_url || "",
                is_active: data?.is_active ?? true
            });
        }
    }, [open, data, categories]);

    const onSubmit = (values: any) => onSave({ ...values, price_cents: Number(values.price_cents) });

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[90%] sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{data ? "Edit Item" : "New Item"}</SheetTitle>
                    <SheetDescription>Update item details, price, and availability.</SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="basic" className="py-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="basic">Basic Info</TabsTrigger>
                        <TabsTrigger value="variants" disabled={!data}>Variants</TabsTrigger>
                        <TabsTrigger value="addons" disabled={!data}>Add-ons</TabsTrigger>
                    </TabsList>

                    {/* Basic Info Tab */}
                    <TabsContent value="basic" className="space-y-4 mt-4">
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input {...form.register("name", { required: true })} placeholder="e.g. Cheeseburger" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Price (Cents)</Label>
                                    <Input type="number" {...form.register("price_cents", { required: true })} />
                                    <div className="text-xs text-muted-foreground">{getCurrencyExample(currencyCode)} (enter amount in paise/cents)</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Category</Label>
                                    <Select onValueChange={(v) => form.setValue("category_id", v)} value={form.watch("category_id")}>
                                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent>
                                            {categories.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                                            {categories.length === 0 && <div className="p-2 text-xs text-muted-foreground">No categories yet</div>}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea {...form.register("description")} />
                            </div>

                            <div className="space-y-2">
                                <Label>Item Image</Label>
                                <Input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} disabled={uploading} />
                                <Input {...form.register("image_url")} placeholder="https://example.com/image.jpg" />
                                {form.watch("image_url") && (
                                    <div className="space-y-2">
                                        <img src={form.watch("image_url")} alt="Preview" className="h-32 w-full object-cover rounded-md border" />
                                        <Input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleReplaceImage} disabled={uploading} />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <Label>Available</Label>
                                    <div className="text-xs text-muted-foreground">Show on public menu</div>
                                </div>
                                <Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} />
                            </div>

                            <SheetFooter className="gap-2 sm:justify-between flex-col sm:flex-row pt-4">
                                {data && (
                                    <Button type="button" variant="destructive" onClick={() => onDelete(data.id)}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </Button>
                                )}
                                <Button type="submit">Save Item</Button>
                            </SheetFooter>
                        </form>
                    </TabsContent>

                    {/* Variants Tab */}
                    <TabsContent value="variants" className="space-y-4 mt-4">
                        {data && restaurantId ? (
                            <VariantEditor menuItemId={data.id} restaurantId={restaurantId} />
                        ) : (
                            <div className="text-center py-8 text-sm text-muted-foreground">
                                Save the item first to add variants
                            </div>
                        )}
                    </TabsContent>

                    {/* Add-ons Tab */}
                    <TabsContent value="addons" className="space-y-4 mt-4">
                        {data && restaurantId ? (
                            <AddonEditor menuItemId={data.id} restaurantId={restaurantId} />
                        ) : (
                            <div className="text-center py-8 text-sm text-muted-foreground">
                                Save the item first to add add-ons
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
