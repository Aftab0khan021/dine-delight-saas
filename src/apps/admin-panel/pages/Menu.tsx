import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { 
  Grip, 
  Image as ImageIcon, 
  MoreHorizontal, 
  Plus, 
  Search, 
  Trash2 
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

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
};

// --- Helpers ---
function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function AdminMenu() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

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
        await supabase.from("categories").update(values).eq("id", editCat.id);
      } else {
        await supabase.from("categories").insert({ ...values, restaurant_id: restaurant!.id, sort_order: categories.length });
      }
    },
    onSuccess: () => {
      setCatSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Saved", description: "Category updated." });
    }
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("categories").update({ deleted_at: new Date().toISOString() } as any).eq("id", id);
    },
    onSuccess: () => {
      setCatSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Deleted", description: "Category removed." });
    }
  });

  const saveItem = useMutation({
    mutationFn: async (values: any) => {
      if (editItem) {
        await supabase.from("menu_items").update(values).eq("id", editItem.id);
      } else {
        await supabase.from("menu_items").insert({ ...values, restaurant_id: restaurant!.id, sort_order: items.length });
      }
    },
    onSuccess: () => {
      setItemSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Saved", description: "Menu item updated." });
    }
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("menu_items").update({ deleted_at: new Date().toISOString() } as any).eq("id", id);
    },
    onSuccess: () => {
      setItemSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Deleted", description: "Item removed." });
    }
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your food and drink offerings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setEditCat(null); setCatSheetOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
          <Button onClick={() => { setEditItem(null); setItemSheetOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-3">
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
                  "cursor-grab", // <--- UPDATED: Simple grab hand only
                  // Default Style
                  draggedCatId !== cat.id && "border-border shadow-sm hover:border-primary/20 hover:shadow-md",
                  // Active Drag Style (LIFTED LOOK)
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
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="text-base">Menu Items</CardTitle>
            <div className="relative w-full max-w-xs">
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
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{formatMoney(item.price_cents)}</span>
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
        onSave={(vals: any) => saveCategory.mutate(vals)}
        onDelete={(id: string) => deleteCategory.mutate(id)}
      />

      <ItemSheet 
        open={itemSheetOpen} 
        onOpenChange={setItemSheetOpen} 
        data={editItem} 
        categories={categories}
        onSave={(vals: any) => saveItem.mutate(vals)}
        onDelete={(id: string) => deleteItem.mutate(id)}
      />
    </div>
  );
}

// --- Subcomponent: Category Sheet ---
function CategorySheet({ open, onOpenChange, data, onSave, onDelete }: any) {
  const form = useForm();
  
  useMemo(() => {
    if (open) {
      form.reset({
        name: data?.name || "",
        description: data?.description || "",
      });
    }
  }, [open, data]);

  const onSubmit = (values: any) => onSave(values);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
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
          <SheetFooter className="gap-2 sm:justify-between">
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
function ItemSheet({ open, onOpenChange, data, categories, onSave, onDelete }: any) {
  const form = useForm();

  useMemo(() => {
    if (open) {
      form.reset({
        name: data?.name || "",
        description: data?.description || "",
        price_cents: data?.price_cents || 0,
        category_id: data?.category_id || (categories[0]?.id ?? ""),
        image_url: data?.image_url || "",
        is_active: data?.is_active ?? true 
      });
    }
  }, [open, data]);

  const onSubmit = (values: any) => onSave({ ...values, price_cents: Number(values.price_cents) });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{data ? "Edit Item" : "New Item"}</SheetTitle>
          <SheetDescription>Update item details, price, and availability.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-6">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register("name", { required: true })} placeholder="e.g. Cheeseburger" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Price (Cents)</Label>
              <Input type="number" {...form.register("price_cents", { required: true })} />
              <div className="text-xs text-muted-foreground">1000 = $10.00</div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select 
                onValueChange={(v) => form.setValue("category_id", v)} 
                defaultValue={form.getValues("category_id")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} />
          </div>

          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input {...form.register("image_url")} placeholder="https://..." />
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

          <SheetFooter className="gap-2 sm:justify-between pt-4">
            {data && (
              <Button type="button" variant="destructive" onClick={() => onDelete(data.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
            <Button type="submit">Save Item</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}