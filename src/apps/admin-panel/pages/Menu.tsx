import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Grip,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  RefreshCw,
  Pencil,
  GripVertical,
  AlertCircle
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useFeatureLimit } from "../hooks/useFeatureAccess";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { VariantEditor } from "../components/menu/VariantEditor";
import { AddonEditor } from "../components/menu/AddonEditor";
import { formatMoney } from "@/lib/formatting";

// --- Types ---
type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  restaurant_id: string;
};

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean;
  food_type: string | null;
  tags: string[] | null;
  spice_level: number | null;
  allergens: string[] | null;
  packaging_charge_cents: number | null;
};

import { getCurrencyExample } from "@/lib/currency-utils";

export default function AdminMenu() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  const currencyCode = restaurant?.currency_code || "INR";

  // --- State ---
  const [search, setSearch] = useState("");
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);

  // Sheet States
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [editCat, setEditCat] = useState<CategoryRow | null>(null);

  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItemRow | null>(null);

  // --- Queries ---
  const categoriesQuery = useQuery({
    queryKey: ["admin", "menu", restaurant?.id, "categories"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data as CategoryRow[];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["admin", "menu", restaurant?.id, "items"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data as MenuItemRow[];
    },
  });

  // Fetch menu items limit
  const { limit: menuItemsLimit, isAtLimit } = useFeatureLimit(restaurant?.id, 'menu_items_limit');
  const currentMenuItems = itemsQuery.data?.length || 0;
  const isMenuAtLimit = isAtLimit(currentMenuItems);
  const isUnlimited = menuItemsLimit === -1;

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  // --- Derived Data ---
  const itemCountByCat = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      if (i.category_id) map.set(i.category_id, (map.get(i.category_id) || 0) + 1);
    });
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    const s = search.toLowerCase().trim();
    return items.filter(i => i.name.toLowerCase().includes(s));
  }, [items, search]);

  // --- Drag & Drop Logic ---
  const reorderMutation = useMutation({
    mutationFn: async (updates: CategoryRow[]) => {
      const { error } = await supabase.from("categories").upsert(updates);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Reordered", description: "New category order saved." });
    },
    onError: (err: any) => {
      toast({ title: "Reorder Failed", description: err.message, variant: "destructive" });
    }
  });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCatId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedCatId || draggedCatId === targetId) return;

    const oldIndex = categories.findIndex(c => c.id === draggedCatId);
    const newIndex = categories.findIndex(c => c.id === targetId);

    if (oldIndex === -1 || newIndex === -1) return;

    const newCategories = [...categories];
    const [movedItem] = newCategories.splice(oldIndex, 1);
    newCategories.splice(newIndex, 0, movedItem);

    const updates = newCategories.map((cat, index) => ({
      ...cat,
      sort_order: index
    }));

    reorderMutation.mutate(updates);
    setDraggedCatId(null);
  };

  // --- CRUD Mutations ---
  const saveCategory = useMutation({
    mutationFn: async (values: any) => {
      if (editCat) {
        const { error } = await supabase.from("categories").update(values).eq("id", editCat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert({ ...values, restaurant_id: restaurant!.id, sort_order: categories.length });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setCatSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Saved", description: "Category updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setCatSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Deleted", description: "Category removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const saveItem = useMutation({
    mutationFn: async (values: any) => {
      // 1. Sanitize Data
      const payload = {
        name: values.name,
        description: values.description,
        price_cents: Number(values.price_cents),
        category_id: values.category_id === "" ? null : values.category_id,
        image_url: values.image_url || null,
        is_active: values.is_active,
        food_type: values.food_type || 'veg',
        tags: values.tags || [],
        spice_level: values.spice_level != null ? Number(values.spice_level) : null,
        allergens: values.allergens || [],
        packaging_charge_cents: Number(values.packaging_charge_cents) || 0,
        restaurant_id: restaurant!.id
      };

      let result;
      if (editItem) {
        const { data, error } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", editItem.id)
          .eq("restaurant_id", restaurant!.id)
          .select()
          .single();
        if (error) throw error;
        if (!data) throw new Error("Menu item not found");
        result = { data, action: "updated" };
      } else {
        const { data, error } = await supabase
          .from("menu_items")
          .insert({ ...payload, sort_order: items.length })
          .select()
          .single();
        if (error) throw error;
        result = { data, action: "created" };
      }

      // Log activity
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("activity_logs").insert({
          restaurant_id: restaurant!.id,
          entity_type: "menu_item",
          entity_id: result.data.id,
          action: `menu_item_${result.action}`,
          message: `${result.action === "created" ? "Created" : "Updated"} menu item: ${result.data.name}`,
          actor_user_id: user?.id
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }

      return result;
    },
    onSuccess: (result) => {
      setItemSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({
        title: result.action === "created" ? "Item created" : "Item updated",
        description: `${result.data.name} has been saved.`
      });
    },
    onError: (err: any) => {
      console.error("Save Item Error:", err);
      toast({
        title: "Failed to save item",
        description: err.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const item = items.find(i => i.id === id);
      const { data, error } = await supabase
        .from("menu_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", restaurant!.id)
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error("Menu item not found");

      // Log activity
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("activity_logs").insert({
          restaurant_id: restaurant!.id,
          entity_type: "menu_item",
          entity_id: id,
          action: "menu_item_deleted",
          message: `Deleted menu item: ${item?.name || "Unknown"}`,
          actor_user_id: user?.id
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }

      return { name: item?.name || "Item" };
    },
    onSuccess: (result) => {
      setItemSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({
        title: "Item deleted",
        description: `${result.name} has been removed.`
      });
    },
    onError: (err: any) => {
      console.error("Delete Item Error:", err);
      toast({
        title: "Failed to delete item",
        description: err.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  return (
    <div className="flex flex-col gap-4 w-full">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your food and drink offerings.</p>
          {menuItemsLimit !== undefined && (
            <p className="mt-2 text-sm font-medium">
              Menu Items: {currentMenuItems} / {isUnlimited ? '\u221E' : menuItemsLimit}
              {isMenuAtLimit && <span className="text-destructive ml-2">\u2022 Limit reached</span>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Add Refresh Button for troubleshooting */}
          <Button variant="outline" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["admin", "menu"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={() => { setEditCat(null); setCatSheetOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
          <Button disabled={isMenuAtLimit} onClick={() => { setEditItem(null); setItemSheetOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </div>
      </header>

      {/* Menu Items Limit Warning */}
      {isMenuAtLimit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Menu Items Limit Reached</AlertTitle>
          <AlertDescription>
            You've reached your plan's menu items limit of {menuItemsLimit} items.
            To add more menu items, please upgrade your subscription plan.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        {/* LEFT COLUMN: Categories (Draggable) */}
        <Card className="shadow-sm lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, cat.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, cat.id)}
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-xl border bg-background p-3 transition-all duration-200",
                  "cursor-grab",
                  draggedCatId !== cat.id && "border-border shadow-sm hover:border-primary/20 hover:shadow-md",
                  draggedCatId === cat.id && "border-2 border-primary shadow-xl scale-[1.02] z-10 relative bg-background"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                  <Grip className={cn(
                    "h-4 w-4 text-muted-foreground transition-colors",
                    draggedCatId === cat.id && "text-primary"
                  )} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{cat.name}</div>
                    <div className="text-xs text-muted-foreground">{itemCountByCat.get(cat.id) || 0} items</div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditCat(cat); setCatSheetOpen(true); }}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {categories.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No categories.</div>}
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Items */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Menu Items</CardTitle>
              {menuItemsLimit !== undefined && !isUnlimited && (
                <CardDescription>
                  {currentMenuItems} of {menuItemsLimit} menu items used
                </CardDescription>
              )}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 transition-all hover:shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${(item as any).food_type === 'nonveg' ? 'bg-red-500' : (item as any).food_type === 'egg' ? 'bg-yellow-500' : 'bg-green-500'}`} title={(item as any).food_type || 'veg'} />
                        <span className="truncate text-sm font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{formatMoney(item.price_cents, currencyCode)}</span>
                        {(item as any).spice_level > 0 && <span className="text-xs">{'🌶️'.repeat(Math.min((item as any).spice_level, 3))}</span>}
                        {((item as any).tags || []).slice(0, 2).map((t: string) => <Badge key={t} variant="outline" className="h-4 px-1 text-[9px]">{t}</Badge>)}
                        {!item.is_active && <Badge variant="destructive" className="h-4 px-1 text-[10px]">Sold Out</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditItem(item); setItemSheetOpen(true); }}>
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
              {filteredItems.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No items found.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- EDITORS --- */}

      <CategorySheet
        open={catSheetOpen}
        onOpenChange={setCatSheetOpen}
        data={editCat}
        categories={categories}
        onSave={(vals: any) => saveCategory.mutate(vals)}
        onDelete={(id: string) => deleteCategory.mutate(id)}
      />

      <ItemSheet
        open={itemSheetOpen}
        onOpenChange={setItemSheetOpen}
        data={editItem}
        categories={categories}
        restaurantId={restaurant?.id || ""}
        currencyCode={currencyCode}
        onSave={(vals: any) => saveItem.mutate(vals)}
        onDelete={(id: string) => deleteItem.mutate(id)}
      />
    </div>
  );
}

// --- Subcomponent: Category Sheet ---
function CategorySheet({ open, onOpenChange, data, onSave, onDelete, categories }: any) {
  const form = useForm();

  useEffect(() => {
    if (open) {
      form.reset({
        name: data?.name || "",
        description: data?.description || "",
        parent_id: data?.parent_id || "",
        available_from: data?.available_from || "",
        available_to: data?.available_to || "",
      });
    }
  }, [open, data]);

  const onSubmit = (values: any) => onSave({
    ...values,
    parent_id: values.parent_id || null,
    available_from: values.available_from || null,
    available_to: values.available_to || null,
  });

  // Filter out self for parent dropdown
  const parentOptions = (categories || []).filter((c: any) => c.id !== data?.id && !c.parent_id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[90%] sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data ? "Edit Category" : "New Category"}</SheetTitle>
          <SheetDescription>Organize your menu sections.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-6">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register("name", { required: true })} placeholder="e.g. Starters" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} placeholder="Optional details..." />
          </div>

          {/* Parent Category (Subcategory support) */}
          <div className="space-y-2">
            <Label>Parent Category <span className="text-xs text-muted-foreground">(optional — makes this a subcategory)</span></Label>
            <Select
              onValueChange={(v) => form.setValue("parent_id", v === "__none__" ? "" : v)}
              value={form.watch("parent_id") || "__none__"}
            >
              <SelectTrigger>
                <SelectValue placeholder="None (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (top-level)</SelectItem>
                {parentOptions.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule (time-based availability) */}
          <div className="space-y-2">
            <Label>Availability Schedule <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <p className="text-xs text-muted-foreground">Leave empty to show all day. Set times for breakfast/lunch/dinner menus.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="time" {...form.register("available_from")} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="time" {...form.register("available_to")} />
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 sm:justify-between flex-col sm:flex-row">
            {data && (
              <Button type="button" variant="destructive" onClick={() => onDelete(data.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
            <Button type="submit">Save Changes</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// --- Subcomponent: Item Sheet ---
function ItemSheet({ open, onOpenChange, data, categories, restaurantId, currencyCode, onSave, onDelete }: any) {
  const form = useForm();
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, upsert = false) => {
    if (!e.target.files?.length) return;

    const file = e.target.files[0];

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return;
    }

    // Validate file size (max 5MB)
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return;
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("menu-items")
        .upload(fileName, file, { upsert });

      if (error) throw error;

      const { data } = supabase.storage
        .from("menu-items")
        .getPublicUrl(fileName);

      form.setValue("image_url", data.publicUrl, { shouldDirty: true });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (open) {
      form.reset({
        name: data?.name || "",
        description: data?.description || "",
        price_cents: data?.price_cents || 0,
        category_id: data?.category_id || (categories && categories.length > 0 ? categories[0].id : ""),
        image_url: data?.image_url || "",
        is_active: data?.is_active ?? true,
        food_type: data?.food_type || 'veg',
        tags: data?.tags || [],
        spice_level: data?.spice_level ?? 0,
        allergens: data?.allergens || [],
        packaging_charge_cents: data?.packaging_charge_cents || 0,
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-6">
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
              <Select
                onValueChange={(v) => form.setValue("category_id", v)}
                value={form.watch("category_id")} // Use watch to control value
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {(categories || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {(!categories || categories.length === 0) && <div className="p-2 text-xs text-muted-foreground">No categories yet</div>}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Food Type (mandatory) */}
          <div className="space-y-2">
            <Label>Food Type <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              {(['veg', 'nonveg', 'egg'] as const).map(ft => (
                <button
                  key={ft}
                  type="button"
                  onClick={() => form.setValue('food_type', ft)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors',
                    form.watch('food_type') === ft
                      ? ft === 'veg' ? 'border-green-500 bg-green-50 text-green-700'
                        : ft === 'egg' ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-muted text-muted-foreground hover:border-border'
                  )}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${ft === 'veg' ? 'bg-green-500' : ft === 'egg' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                  {ft === 'veg' ? 'Veg' : ft === 'nonveg' ? 'Non-Veg' : 'Egg'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Spice Level */}
            <div className="space-y-2">
              <Label>Spice Level</Label>
              <div className="flex gap-1">
                {[0, 1, 2, 3].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => form.setValue('spice_level', level)}
                    className={cn(
                      'rounded-lg border-2 px-3 py-1.5 text-sm transition-colors',
                      form.watch('spice_level') === level
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-muted text-muted-foreground hover:border-border'
                    )}
                  >
                    {level === 0 ? 'Mild' : '🌶️'.repeat(level)}
                  </button>
                ))}
              </div>
            </div>

            {/* Packaging Charge */}
            <div className="space-y-2">
              <Label>Packaging Charge (paise)</Label>
              <Input type="number" {...form.register('packaging_charge_cents')} placeholder="0" />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {['Indian', 'Chinese', 'Italian', 'Continental', 'South Indian', 'Mughlai', 'Thai', 'Spicy', "Chef's Special", 'New', 'Bestseller', 'Healthy', 'Jain'].map(tag => {
                const selected = (form.watch('tags') || []).includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const current: string[] = form.watch('tags') || [];
                      form.setValue('tags', selected ? current.filter(t => t !== tag) : [...current, tag]);
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted text-muted-foreground hover:border-border'
                    )}
                  >
                    {selected ? '✓ ' : ''}{tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Allergens */}
          <div className="space-y-2">
            <Label>Allergens</Label>
            <div className="flex flex-wrap gap-1.5">
              {['Gluten', 'Dairy', 'Nuts', 'Peanuts', 'Shellfish', 'Soy', 'Egg', 'Fish', 'Sesame'].map(allergen => {
                const selected = (form.watch('allergens') || []).includes(allergen);
                return (
                  <button
                    key={allergen}
                    type="button"
                    onClick={() => {
                      const current: string[] = form.watch('allergens') || [];
                      form.setValue('allergens', selected ? current.filter(a => a !== allergen) : [...current, allergen]);
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-muted text-muted-foreground hover:border-border'
                    )}
                  >
                    {selected ? '⚠ ' : ''}{allergen}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Item Image</Label>
            <Input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={(e) => handleImageUpload(e, false)}
              disabled={uploading}
            />
            <Input
              {...form.register("image_url")}
              placeholder="https://example.com/image.jpg"
            />
            {form.watch("image_url") && (
              <div className="space-y-2">
                <img
                  src={form.watch("image_url")}
                  alt="Preview"
                  className="h-32 w-full object-cover rounded-md border"
                />
                <Input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={(e) => handleImageUpload(e, true)}
                  disabled={uploading}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <Label>Available</Label>
              <div className="text-xs text-muted-foreground">Show on public menu</div>
            </div>
            <Switch
              checked={form.watch("is_active")}
              onCheckedChange={(v) => form.setValue("is_active", v)}
            />
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

        {/* Variants & Add-ons */}
        <div className="space-y-4 mt-6 pt-6 border-t">
          <h3 className="font-medium">Variants & Add-ons</h3>
          {data && restaurantId ? (
            <>
              <VariantEditor menuItemId={data.id} restaurantId={restaurantId} />
              <AddonEditor menuItemId={data.id} restaurantId={restaurantId} />
            </>
          ) : (
            <div className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
              Please save the item first to add variants and add-ons.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}