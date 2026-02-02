import { Turnstile } from "@/components/security/Turnstile";

// ... existing imports

export default function PublicMenu() {
  // ... existing hooks

  const [turnstileToken, setTurnstileToken] = useState(""); // [NEW]

  // ... (keep existing state)

  // --- Checkout Handler (SECURE FIX FOR 401 & DDoS) ---
  const handlePlaceOrder = async () => {
    if (!restaurant) return;

    // Validate Turnstile
    if (!turnstileToken) {
      toast({ title: "Security Check", description: "Please complete the security challenge.", variant: "destructive" });
      return;
    }

    setIsPlacingOrder(true);

    try {
      // 1. Retrieve Config (URL & Anon Key)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (supabase as any).supabaseUrl;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (supabase as any).supabaseKey;

      if (!supabaseUrl || !anonKey) {
        throw new Error("Configuration Error: Missing Supabase URL or Key.");
      }

      const finalTableLabel = tableLabel || searchParams.get("table");

      const response = await fetch(`${supabaseUrl}/functions/v1/place-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: cartItems.map(i => ({
            menu_item_id: i.menu_item_id,
            quantity: i.quantity,
            variant_id: i.variant_id || null,
            addons: i.addons || [],
            notes: i.notes || null
          })),
          table_label: finalTableLabel,
          coupon_code: coupon?.code || null,
          turnstileToken // [NEW] Send token to backend
        })
      });

      // 3. Handle Response
      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server Error (${response.status}): ${text}`);
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      // 4. Success
      clear();
      setIsCartOpen(false);
      setTurnstileToken(""); // Reset token
      if (window.turnstile) window.turnstile.reset();

      if (data?.order_token) {
        navigate(`/track?token=${data.order_token}`);
      } else {
        toast({ title: "Order Placed", description: "Your order has been received!" });
      }

    } catch (err: any) {
      console.error("Order Error:", err);
      toast({
        title: "Order Failed",
        description: err.message || "Please try again.",
        variant: "destructive"
      });
      // Reset Turnstile on error to force re-verification if needed
      setTurnstileToken("");
      if (window.turnstile) window.turnstile.reset();
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (loadingRest) return <div className="h-screen flex items-center justify-center">Loading menu...</div>;
  if (!restaurant) return <div className="h-screen flex items-center justify-center">Restaurant not found.</div>;

  const themeColor = (restaurant.settings as any)?.theme?.primary_color || "#0f172a";

  return (
    <div className="min-h-screen bg-background pb-20">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/r/${slug}`} className="p-2 -ml-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
            <h1 className="font-semibold text-lg truncate">{restaurant.name}</h1>
          </div>
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <div className="relative p-2 cursor-pointer">
                <ShoppingBag className="h-6 w-6 text-foreground" />
                {itemCount > 0 && <span className="absolute top-0 right-0 h-5 w-5 text-[10px] font-bold flex items-center justify-center rounded-full text-white ring-2 ring-background" style={{ backgroundColor: themeColor }}>{itemCount}</span>}
              </div>
            </SheetTrigger>
            <SheetContent className="flex flex-col w-full sm:max-w-md">
              <SheetHeader><SheetTitle>Your Order</SheetTitle>
                {tableLabel && <div className="text-sm text-muted-foreground">Table: <span className="font-semibold text-foreground">{tableLabel}</span></div>}
              </SheetHeader>
              <div className="flex-1 overflow-hidden mt-4">
                {cartItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2"><ShoppingBag className="h-12 w-12 opacity-20" /><p>Your cart is empty.</p></div>
                ) : (
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4">
                      {cartItems.map((item) => {
                        const menuItem = cartItemsAvailability.find(mi => mi.id === item.menu_item_id);
                        const isUnavailable = menuItem && !menuItem.is_active;

                        return (
                          <div key={item.menu_item_id} className={`flex items-start justify-between gap-3 ${isUnavailable ? 'opacity-60' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{item.name}</div>
                              {item.variant_name && <div className="text-xs text-muted-foreground">Size: {item.variant_name}</div>}
                              {item.addons && item.addons.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {item.addons.map(a => a.name).join(", ")}
                                </div>
                              )}
                              {isUnavailable && (
                                <div className="text-xs text-destructive font-medium mt-0.5">Unavailable</div>
                              )}
                              <div className="text-sm text-muted-foreground">{formatMoney(item.price_cents)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 border rounded-md p-0.5">
                                <button onClick={() => decrement(item.cart_id)} className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded text-muted-foreground"><Minus className="h-3 w-3" /></button>
                                <span className="text-sm w-4 text-center font-medium">{item.quantity}</span>
                                <button onClick={() => increment(item.cart_id)} className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded text-muted-foreground"><Plus className="h-3 w-3" /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
              {cartItems.length > 0 && (
                <div className="pt-4 space-y-4">
                  {/* Coupon Section */}
                  <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                    {coupon ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          🎉 Coupon Applied: {coupon.code}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={removeCoupon}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Coupon Code"
                          className="h-8 text-sm"
                          value={search} // Re-using search state for temp coupon input is bad, let's create a local state
                          onChange={(e) => setSearch(e.target.value)} // Wait, search is for items. I need a new state.
                        />
                        {/* STOP: I need to add state for coupon input inside the component first */}
                      </div>
                    )}
                  </div>

                  {/* Coupon Section */}
                  <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                    {coupon ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          🎉 Coupon Applied: {coupon.code}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={removeCoupon}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Coupon Code"
                          className="h-9 text-sm"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleApplyCoupon();
                          }}
                        />
                        <Button size="sm" variant="secondary" className="h-9 px-3" onClick={handleApplyCoupon} disabled={!couponInput || isValidatingCoupon}>
                          {isValidatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator />
                  {hasUnavailableItems && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
                      ⚠️ Some items are no longer available. Please remove them to continue.
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-sm"><span>Subtotal</span><span>{formatMoney(subtotalCents)}</span></div>
                    {discountCents > 0 && (
                      <div className="flex items-center justify-between text-green-600 text-sm font-medium"><span>Discount</span><span>-{formatMoney(discountCents)}</span></div>
                    )}
                    <div className="flex items-center justify-between font-bold text-lg"><span>Total</span><span>{formatMoney(totalCents)}</span></div>
                  </div>

                  <div className="flex justify-center py-2">
                    <Turnstile onSuccess={setTurnstileToken} />
                  </div>

                  <Button className="w-full h-12 text-base font-bold" size="lg" style={{ backgroundColor: themeColor }} onClick={handlePlaceOrder} disabled={isPlacingOrder || hasUnavailableItems}>
                    {isPlacingOrder ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing Order...</> : "Place Order"}
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
        <div className="w-full overflow-x-auto whitespace-nowrap scrollbar-hide border-t bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4 py-2 flex gap-2">
            <button onClick={() => setActiveCategory("all")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeCategory === "all" ? "text-white shadow-sm" : "bg-background text-muted-foreground border hover:bg-muted"}`} style={activeCategory === "all" ? { backgroundColor: themeColor, borderColor: themeColor } : {}}>All</button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeCategory === cat.id ? "text-white shadow-sm" : "bg-background text-muted-foreground border hover:bg-muted"}`} style={activeCategory === cat.id ? { backgroundColor: themeColor, borderColor: themeColor } : {}}>{cat.name}</button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-3xl mx-auto px-4 py-6 space-y-8">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input placeholder="Search items..." className="pl-10 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {activeCategory === "all" && groupedItems ? (
          categories.map(cat => {
            const catItems = groupedItems[cat.id];
            if (!catItems?.length) return null;
            return (
              <div key={cat.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h2 className="font-bold text-lg">{cat.name}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {catItems.map(item => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onAdd={() => { setCustomizingItem(item); setIsCustomizeOpen(true); }}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {filteredItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAdd={() => { setCustomizingItem(item); setIsCustomizeOpen(true); }}
              />
            ))}
            {!filteredItems.length && <p className="col-span-full text-center text-muted-foreground py-10">No items found.</p>}
          </div>
        )}
        {activeCategory === "all" && groupedItems?.["uncategorized"]?.length ? (
          <div className="space-y-3">
            <h2 className="font-bold text-lg">Other</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {groupedItems["uncategorized"].map(item => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAdd={() => { setCustomizingItem(item); setIsCustomizeOpen(true); }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>
      <MenuItemDialog
        open={isCustomizeOpen}
        onOpenChange={setIsCustomizeOpen}
        item={customizingItem}
        restaurantId={restaurant?.id || ""}
        themeColor={themeColor}
        onAddToCart={(item) => {
          addItem(item);
          toast({ title: "Added", description: `${item.name} added to cart.` });
        }}
      />
    </div>
  );
}

function MenuItemCard({ item, onAdd }: { item: MenuItem, onAdd: () => void }) {
  return (
    <Card className="flex overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div><div className="font-semibold line-clamp-1">{item.name}</div><div className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description || "No description available."}</div></div>
        <div className="font-bold text-sm mt-3 flex items-center justify-between"><span>{formatMoney(item.price_cents)}</span><Button size="sm" variant="outline" className="h-7 px-3 text-xs rounded-full" onClick={onAdd}>Add</Button></div>
      </div>
      {item.image_url ? <div className="w-28 bg-muted shrink-0 relative"><img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /></div> : <div className="w-24 bg-muted/50 shrink-0 flex items-center justify-center text-muted-foreground/30"><ImageOff className="h-6 w-6" /></div>}
    </Card>
  );
}