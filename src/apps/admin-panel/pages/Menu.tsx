import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Pencil, Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CategoryEditorDrawer, type CategoryEditorValues } from "../components/menu/CategoryEditorDrawer";
import { MenuItemEditorDrawer, type MenuItemEditorValues } from "../components/menu/MenuItemEditorDrawer";

function formatMoney(cents: number, currency = "USD") {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price_cents: number;
  currency_code: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

export default function AdminMenu() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();

  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);

  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemRow | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "active" | "inactive">("all");

  const categoriesQuery = useQuery({
    queryKey: ["admin", "menu", restaurant?.id, "categories"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, description, is_active, sort_order")
        .eq("restaurant_id", restaurant!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const menuItemsQuery = useQuery({
    queryKey: ["admin", "menu", restaurant?.id, "menuItems"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(
          "id, name, description, category_id, price_cents, currency_code, image_url, is_active, sort_order",
        )
        .eq("restaurant_id", restaurant!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MenuItemRow[];
    },
  });

  const itemCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of menuItemsQuery.data ?? []) {
      if (!it.category_id) continue;
      map.set(it.category_id, (map.get(it.category_id) ?? 0) + 1);
    }
    return map;
  }, [menuItemsQuery.data]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (menuItemsQuery.data ?? []).filter((it) => {
      if (s && !it.name.toLowerCase().includes(s)) return false;
      if (categoryFilter !== "all" && (it.category_id ?? "none") !== categoryFilter) return false;
      if (availabilityFilter === "active" && !it.is_active) return false;
      if (availabilityFilter === "inactive" && it.is_active) return false;
      return true;
    });
  }, [availabilityFilter, categoryFilter, menuItemsQuery.data, search]);

  const categorySaveMutation = useMutation({
    mutationFn: async (values: CategoryEditorValues) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      if (editingCategory) {
        const { error } = await supabase
          .from("categories")
          .update({
            name: values.name,
            description: values.description ?? null,
            is_active: values.is_active,
          })
          .eq("id", editingCategory.id)
          .eq("restaurant_id", restaurant.id);
        if (error) throw error;
        return;
      }

      const existing = categoriesQuery.data ?? [];
      const nextSort = existing.length ? Math.max(...existing.map((c) => c.sort_order ?? 0)) + 1 : 0;

      const { error } = await supabase.from("categories").insert({
        restaurant_id: restaurant.id,
        name: values.name,
        description: values.description ?? null,
        is_active: values.is_active,
        sort_order: nextSort,
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setCategoryEditorOpen(false);
      setEditingCategory(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant?.id, "categories"] }),
        qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant?.id, "menuItems"] }),
      ]);
    },
  });

  const categoryToggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");
      const { error } = await supabase
        .from("categories")
        .update({ is_active })
        .eq("id", id)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant?.id, "categories"] }),
  });

  const categoryReorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const updates = orderedIds.map((id, index) =>
        supabase
          .from("categories")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("restaurant_id", restaurant.id),
      );

      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant?.id, "categories"] }),
  });

  const menuItemSaveMutation = useMutation({
    mutationFn: async (values: MenuItemEditorValues) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      if (editingItem) {
        const { error } = await supabase
          .from("menu_items")
          .update({
            name: values.name,
            description: values.description ?? null,
            category_id: values.category_id ?? null,
            price_cents: values.price_cents,
            image_url: values.image_url ?? null,
            is_active: values.is_active,
          })
          .eq("id", editingItem.id)
          .eq("restaurant_id", restaurant.id);
        if (error) throw error;
        return;
      }

      const existing = menuItemsQuery.data ?? [];
      const nextSort = existing.length ? Math.max(...existing.map((i) => i.sort_order ?? 0)) + 1 : 0;

      const { error } = await supabase.from("menu_items").insert({
        restaurant_id: restaurant.id,
        name: values.name,
        description: values.description ?? null,
        category_id: values.category_id ?? null,
        price_cents: values.price_cents,
        image_url: values.image_url ?? null,
        is_active: values.is_active,
        sort_order: nextSort,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setItemEditorOpen(false);
      setEditingItem(null);
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant?.id, "menuItems"] });
    },
  });

  const menuItemToggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");
      const { error } = await supabase
        .from("menu_items")
        .update({ is_active })
        .eq("id", id)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant?.id, "menuItems"] }),
  });

  const categories = categoriesQuery.data ?? [];
  const menuItems = menuItemsQuery.data ?? [];

  const [dragId, setDragId] = useState<string | null>(null);
  const orderedCategoryIds = useMemo(() => categories.map((c) => c.id), [categories]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="text-sm text-muted-foreground">Manage categories and menu items for {restaurant?.name}.</p>
      </header>

      {/* SECTION 1: Categories */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Organize your menu and control visibility.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingCategory(null);
                setCategoryEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add category
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {categoriesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading categories…</p>
          ) : categories.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">No categories yet</p>
              <p className="text-sm text-muted-foreground">Create your first category to start building your menu.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Name</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Visible</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((c) => {
                      const count = itemCountByCategory.get(c.id) ?? 0;
                      return (
                        <TableRow
                          key={c.id}
                          draggable
                          onDragStart={() => setDragId(c.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (!dragId || dragId === c.id) return;
                            const ids = [...orderedCategoryIds];
                            const from = ids.indexOf(dragId);
                            const to = ids.indexOf(c.id);
                            if (from < 0 || to < 0) return;
                            ids.splice(from, 1);
                            ids.splice(to, 0, dragId);
                            categoryReorderMutation.mutate(ids);
                            setDragId(null);
                          }}
                        >
                          <TableCell className="text-muted-foreground">
                            <GripVertical className="h-4 w-4" />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{c.name}</span>
                              {!c.is_active ? <Badge variant="secondary">Hidden</Badge> : null}
                            </div>
                            {c.description ? <p className="text-xs text-muted-foreground">{c.description}</p> : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{count}</TableCell>
                          <TableCell>
                            <Switch
                              checked={c.is_active}
                              onCheckedChange={(v) => categoryToggleMutation.mutate({ id: c.id, is_active: v })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingCategory(c);
                                setCategoryEditorOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="grid gap-3 md:hidden">
                {categories.map((c) => {
                  const count = itemCountByCategory.get(c.id) ?? 0;
                  return (
                    <Card key={c.id}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-sm text-muted-foreground">{count} item{count === 1 ? "" : "s"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={c.is_active}
                              onCheckedChange={(v) => categoryToggleMutation.mutate({ id: c.id, is_active: v })}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingCategory(c);
                                setCategoryEditorOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {c.description ? <p className="text-sm text-muted-foreground">{c.description}</p> : null}
                        <p className="text-xs text-muted-foreground">Reorder on desktop (drag handle).</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: Menu Items */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Menu Items</CardTitle>
              <CardDescription>Add items, set categories, and control availability.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingItem(null);
                setItemEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="relative lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={availabilityFilter} onValueChange={(v) => setAvailabilityFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Available</SelectItem>
                <SelectItem value="inactive">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {menuItemsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading menu items…</p>
          ) : menuItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">No menu items yet</p>
              <p className="text-sm text-muted-foreground">Add your first item to start taking orders.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">No results</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((it) => {
                      const categoryName = it.category_id ? categoryNameById.get(it.category_id) : "Uncategorized";
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 overflow-hidden rounded-md border bg-muted">
                                {it.image_url ? (
                                  <img
                                    src={it.image_url}
                                    alt={`${it.name} image`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : null}
                              </div>
                              <div>
                                <p>{it.name}</p>
                                {it.description ? <p className="text-xs text-muted-foreground line-clamp-1">{it.description}</p> : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{categoryName ?? "—"}</TableCell>
                          <TableCell>{formatMoney(it.price_cents ?? 0, it.currency_code ?? "USD")}</TableCell>
                          <TableCell>
                            <Switch
                              checked={it.is_active}
                              onCheckedChange={(v) => menuItemToggleMutation.mutate({ id: it.id, is_active: v })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingItem(it);
                                setItemEditorOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="grid gap-3 md:hidden">
                {filteredItems.map((it) => {
                  const categoryName = it.category_id ? categoryNameById.get(it.category_id) : "Uncategorized";
                  return (
                    <Card key={it.id}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-md border bg-muted">
                              {it.image_url ? (
                                <img
                                  src={it.image_url}
                                  alt={`${it.name} image`}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : null}
                            </div>
                            <div>
                              <p className="font-medium">{it.name}</p>
                              <p className="text-sm text-muted-foreground">{categoryName}</p>
                              <p className="text-sm">{formatMoney(it.price_cents ?? 0, it.currency_code ?? "USD")}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={it.is_active}
                              onCheckedChange={(v) => menuItemToggleMutation.mutate({ id: it.id, is_active: v })}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingItem(it);
                                setItemEditorOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {it.description ? <p className="text-sm text-muted-foreground">{it.description}</p> : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CategoryEditorDrawer
        open={categoryEditorOpen}
        onOpenChange={(open) => {
          setCategoryEditorOpen(open);
          if (!open) setEditingCategory(null);
        }}
        title={editingCategory ? "Edit Category" : "Add Category"}
        defaultValues={
          editingCategory
            ? {
                name: editingCategory.name,
                description: editingCategory.description ?? "",
                is_active: editingCategory.is_active,
              }
            : { is_active: true }
        }
        saving={categorySaveMutation.isPending}
        onSubmit={async (values) => categorySaveMutation.mutateAsync(values)}
      />

      <MenuItemEditorDrawer
        open={itemEditorOpen}
        onOpenChange={(open) => {
          setItemEditorOpen(open);
          if (!open) setEditingItem(null);
        }}
        title={editingItem ? "Edit Menu Item" : "Add Menu Item"}
        categories={(categoriesQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        defaultValues={
          editingItem
            ? {
                name: editingItem.name,
                description: editingItem.description ?? "",
                category_id: editingItem.category_id,
                price_cents: editingItem.price_cents ?? 0,
                image_url: editingItem.image_url ?? "",
                is_active: editingItem.is_active,
              }
            : { is_active: true, price_cents: 0, category_id: null }
        }
        saving={menuItemSaveMutation.isPending}
        onSubmit={async (values) => menuItemSaveMutation.mutateAsync(values)}
      />
    </section>
  );
}

