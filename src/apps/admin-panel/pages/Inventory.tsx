import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { FeatureGate } from "../components/FeatureGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Package, AlertTriangle, ArrowUpDown, RefreshCw, Link2, Unlink, History, MoreHorizontal, Pencil, Trash2, Lightbulb, X, Copy, Check, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toCents } from "@/lib/formatting";
import { ALL_UNIT_SYMBOLS, ALL_UNITS, UNIT_CATEGORIES, getUnitsByCategory, getSuggestedConversion, formatFactor } from "@/lib/unit-conversions";
import type { UnitCategory } from "@/lib/unit-conversions";

// Storage units for ingredient master (sensible warehouse units only)
const STORAGE_UNITS = ["pcs", "g", "kg", "ml", "L", "lb", "oz", "bunch", "portion", "fillet", "slice", "clove", "doz"];
// Keep UNITS as the storage-only list for Add/Edit ingredient forms
const UNITS = STORAGE_UNITS;

type Ingredient = {
  id: string; name: string; unit: string; current_stock: number;
  low_stock_threshold: number; cost_per_unit_cents: number;
  is_tracked: boolean; created_at: string; updated_at: string; restaurant_id: string;
};

type MenuItemLink = {
  id: string; menu_item_id: string; ingredient_id: string;
  quantity_needed: number; restaurant_id: string;
  recipe_unit: string | null;
  conversion_factor: number;
  menu_items?: { name: string; is_active: boolean };
};

type StockMovement = {
  id: string; change_qty: number; reason: string;
  notes: string | null; created_at: string; reference_id: string | null;
};

export default function Inventory() {
  return (
    <FeatureGate featureKey="inventory_management" featureName="Inventory Management" description="Track ingredients, manage stock levels, and auto-disable menu items when ingredients run out.">
      <InventoryContent />
    </FeatureGate>
  );
}

function InventoryContent() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [restockOpen, setRestockOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({ name: "", unit: "pcs", current_stock: "0", low_stock_threshold: "5", cost_per_unit_cents: "0" });
  const [restockQty, setRestockQty] = useState("");
  const [restockNotes, setRestockNotes] = useState("");
  const [linkItemId, setLinkItemId] = useState("");
  const [linkQty, setLinkQty] = useState("1");
  const [linkRecipeUnit, setLinkRecipeUnit] = useState("");   // recipe unit (may differ from storage)
  const [linkFactor, setLinkFactor] = useState("1");          // conversion factor
  const [linkSuggestion, setLinkSuggestion] = useState<{ label: string; note?: string } | null>(null);
  const [search, setSearch] = useState("");

  // ── Bulk add ingredients state ──
  type BulkRow = { name: string; unit: string; current_stock: string; low_stock_threshold: string };
  const emptyBulkRow = (): BulkRow => ({ name: "", unit: "pcs", current_stock: "0", low_stock_threshold: "5" });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [bulkAdding, setBulkAdding] = useState(false);

  // ── Bulk link state ──
  const [bulkLinkItems, setBulkLinkItems] = useState<string[]>([]);
  const [linkSearch, setLinkSearch] = useState("");

  // ── Real-time: invalidate inventory queries on any DB change ──
  useRealtimeSync(restaurant?.id, [
    { table: "ingredients",          queryKey: ["ingredients"] },
    { table: "stock_movements",       queryKey: ["stock-history"] },
    { table: "ingredient_menu_items", queryKey: ["ingredient-links"] },
  ]);

  // Queries
  const ingredientsQuery = useQuery({
    queryKey: ["ingredients", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ingredients")
        .select("id, name, unit, current_stock, low_stock_threshold, cost_per_unit_cents, is_tracked, created_at, updated_at, restaurant_id").eq("restaurant_id", restaurant!.id).order("name");
      if (error) throw error;
      return (data || []) as Ingredient[];
    },
  });

  const menuItemsQuery = useQuery({
    queryKey: ["menu-items-for-link", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items")
        .select("id, name").eq("restaurant_id", restaurant!.id).is("deleted_at", null).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const linksQuery = useQuery({
    queryKey: ["ingredient-links", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_item_ingredients")
        .select("*, menu_items(name, is_active)").eq("ingredient_id", selected!.id);
      if (error) throw error;
      return (data || []) as MenuItemLink[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["stock-history", selected?.id],
    enabled: !!selected?.id && historyOpen,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("id, change_qty, reason, notes, created_at, reference_id").eq("ingredient_id", selected!.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data || []) as StockMovement[];
    },
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ingredients").insert({
        restaurant_id: restaurant!.id, name: form.name.trim(), unit: form.unit,
        current_stock: parseFloat(form.current_stock) || 0,
        low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
        cost_per_unit_cents: toCents(form.cost_per_unit_cents),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setAddOpen(false);
      setForm({ name: "", unit: "pcs", current_stock: "0", low_stock_threshold: "5", cost_per_unit_cents: "0" });
      toast({ title: "Ingredient added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restockMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("restock_ingredient", {
        p_ingredient_id: selected!.id,
        p_quantity: parseFloat(restockQty),
        p_reason: "restock",
        p_notes: restockNotes || null,
      });
      if (error) throw error;
      return data as { success: boolean; new_stock: number; re_enabled_items: string[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setRestockOpen(false);
      setRestockQty(""); setRestockNotes("");
      const reEnabled = data?.re_enabled_items || [];
      toast({ title: "Restocked!", description: reEnabled.length > 0 ? `Re-enabled: ${reEnabled.join(", ")}` : `New stock: ${data?.new_stock}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const factor = parseFloat(linkFactor);
      // H1: Validate factor — must be a positive finite number
      if (!isFinite(factor) || isNaN(factor) || factor <= 0) {
        throw new Error("Conversion factor must be a positive number greater than zero.");
      }
      const recipeUnit = linkRecipeUnit && linkRecipeUnit !== selected?.unit ? linkRecipeUnit : null;
      const { error } = await supabase.from("menu_item_ingredients").insert({
        menu_item_id: linkItemId,
        ingredient_id: selected!.id,
        quantity_needed: parseFloat(linkQty) || 1,
        restaurant_id: restaurant!.id,
        recipe_unit: recipeUnit,
        conversion_factor: factor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredient-links"] });
      setLinkItemId(""); setLinkQty("1"); setLinkRecipeUnit(""); setLinkFactor("1"); setLinkSuggestion(null);
      toast({ title: "Linked to menu item" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_item_ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredient-links"] });
      toast({ title: "Unlinked" });
    },
  });

  const toggleTrack = useMutation({
    mutationFn: async ({ id, tracked }: { id: string; tracked: boolean }) => {
      const { error } = await supabase.from("ingredients").update({ is_tracked: tracked }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No ingredient selected");
      const { error } = await supabase.from("ingredients").update({
        name: form.name.trim(),
        unit: form.unit,
        current_stock: parseFloat(form.current_stock) || 0,
        low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
        cost_per_unit_cents: toCents(form.cost_per_unit_cents),
      }).eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setEditOpen(false);
      toast({ title: "Ingredient updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setDeleteId(null);
      toast({ title: "Ingredient deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Bulk add ingredients ──
  async function bulkAddIngredients() {
    const validRows = bulkRows.filter(r => r.name.trim());
    if (validRows.length === 0) return;
    setBulkAdding(true);
    try {
      const inserts = validRows.map(r => ({
        restaurant_id: restaurant!.id,
        name: r.name.trim(),
        unit: r.unit,
        current_stock: parseFloat(r.current_stock) || 0,
        low_stock_threshold: parseFloat(r.low_stock_threshold) || 0,
        cost_per_unit_cents: 0,
      }));
      const { error } = await supabase.from("ingredients").insert(inserts);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setAddOpen(false);
      setBulkMode(false);
      setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
      toast({ title: `${validRows.length} ingredient(s) added` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBulkAdding(false);
    }
  }

  // ── Bulk link mutation — link multiple menu items to one ingredient ──
  const bulkLinkMutation = useMutation({
    mutationFn: async () => {
      if (bulkLinkItems.length === 0) throw new Error("Select at least one menu item");
      const factor = parseFloat(linkFactor);
      if (!isFinite(factor) || isNaN(factor) || factor <= 0) {
        throw new Error("Conversion factor must be a positive number.");
      }
      const recipeUnit = linkRecipeUnit && linkRecipeUnit !== selected?.unit ? linkRecipeUnit : null;
      const inserts = bulkLinkItems.map(menuItemId => ({
        menu_item_id: menuItemId,
        ingredient_id: selected!.id,
        quantity_needed: parseFloat(linkQty) || 1,
        restaurant_id: restaurant!.id,
        recipe_unit: recipeUnit,
        conversion_factor: factor,
      }));
      const { error } = await supabase.from("menu_item_ingredients").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredient-links"] });
      setBulkLinkItems([]);
      setLinkItemId(""); setLinkQty("1"); setLinkRecipeUnit(""); setLinkFactor("1"); setLinkSuggestion(null);
      toast({ title: `Linked to menu items` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ingredients = ingredientsQuery.data || [];
  const filtered = ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStockItems = ingredients.filter(i => i.is_tracked && i.current_stock <= i.low_stock_threshold && i.current_stock > 0);
  const outOfStock = ingredients.filter(i => i.is_tracked && i.current_stock <= 0);

  const getStatus = (i: Ingredient) => {
    if (!i.is_tracked) return { label: "Untracked", variant: "outline" as const };
    if (i.current_stock <= 0) return { label: "Out of Stock", variant: "destructive" as const };
    if (i.current_stock <= i.low_stock_threshold) return { label: "Low Stock", variant: "secondary" as const };
    return { label: "In Stock", variant: "default" as const };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> Inventory</h1>
          <p className="text-muted-foreground text-sm">Track ingredients and auto-manage menu item availability</p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Ingredient</Button>
      </div>

      {/* Alerts */}
      {outOfStock.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{outOfStock.length} ingredient(s) out of stock</strong> — affected menu items have been auto-disabled.
            {" "}{outOfStock.map(i => i.name).join(", ")}
          </AlertDescription>
        </Alert>
      )}
      {lowStockItems.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{lowStockItems.length} ingredient(s) running low:</strong>{" "}
            {lowStockItems.map(i => `${i.name} (${i.current_stock} ${i.unit})`).join(", ")}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{ingredients.length}</p><p className="text-xs text-muted-foreground">Total Ingredients</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-600">{ingredients.filter(i => i.is_tracked && i.current_stock > i.low_stock_threshold).length}</p><p className="text-xs text-muted-foreground">In Stock</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-600">{lowStockItems.length}</p><p className="text-xs text-muted-foreground">Low Stock</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-red-600">{outOfStock.length}</p><p className="text-xs text-muted-foreground">Out of Stock</p></CardContent></Card>
      </div>

      {/* Search */}
      <Input placeholder="Search ingredients..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Ingredients</CardTitle><CardDescription>{filtered.length} ingredient(s)</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tracked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No ingredients found. Add your first ingredient to get started.</TableCell></TableRow>
              )}
              {filtered.map(ing => {
                const status = getStatus(ing);
                return (
                  <TableRow key={ing.id}>
                    <TableCell className="font-medium">{ing.name}</TableCell>
                    <TableCell>{ing.current_stock} {ing.unit}</TableCell>
                    <TableCell>{ing.low_stock_threshold} {ing.unit}</TableCell>
                    <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={ing.is_tracked} onCheckedChange={v => toggleTrack.mutate({ id: ing.id, tracked: v })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setSelected(ing); setRestockOpen(true); }}>
                          <ArrowUpDown className="h-3 w-3 mr-1" /> Restock
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setSelected(ing); setLinkOpen(true); }}>
                          <Link2 className="h-3 w-3 mr-1" /> Links
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelected(ing); setHistoryOpen(true); }}>
                              <History className="h-4 w-4 mr-2" /> History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelected(ing);
                              setForm({
                                name: ing.name,
                                unit: ing.unit,
                                current_stock: String(ing.current_stock),
                                low_stock_threshold: String(ing.low_stock_threshold),
                                cost_per_unit_cents: String(ing.cost_per_unit_cents / 100),
                              });
                              setEditOpen(true);
                            }}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(ing.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Ingredient Dialog — Single or Bulk mode */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setBulkMode(false); } }}>
        <DialogContent className={bulkMode ? "max-w-2xl" : ""}>
          <DialogHeader>
            <DialogTitle>Add Ingredient{bulkMode ? "s" : ""}</DialogTitle>
            <DialogDescription>
              {bulkMode ? "Add multiple ingredients at once." : "Track a new ingredient in your inventory."}
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex items-center gap-2 border-b pb-3">
            <Button
              variant={bulkMode ? "outline" : "default"}
              size="sm"
              onClick={() => setBulkMode(false)}
            >
              Single
            </Button>
            <Button
              variant={bulkMode ? "default" : "outline"}
              size="sm"
              onClick={() => setBulkMode(true)}
            >
              <Copy className="h-3 w-3 mr-1" /> Bulk Add
            </Button>
          </div>

          {!bulkMode ? (
            /* ── Single mode (original flow) ── */
            <>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Chicken Breast" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Unit</Label>
                    <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Initial Stock</Label><Input type="number" value={form.current_stock} onChange={e => setForm(p => ({ ...p, current_stock: e.target.value }))} /></div>
                </div>
                <div><Label>Low Stock Threshold</Label><Input type="number" value={form.low_stock_threshold} onChange={e => setForm(p => ({ ...p, low_stock_threshold: e.target.value }))} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={() => addMutation.mutate()} disabled={!form.name.trim() || addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add Ingredient"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            /* ── Bulk mode ── */
            <>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                  <span>Name</span>
                  <span>Unit</span>
                  <span>Stock</span>
                  <span>Threshold</span>
                  <span></span>
                </div>
                {bulkRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 items-center">
                    <Input
                      value={row.name}
                      onChange={e => {
                        const next = [...bulkRows];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setBulkRows(next);
                      }}
                      placeholder={`Ingredient ${idx + 1}`}
                      className="h-8 text-sm"
                    />
                    <Select
                      value={row.unit}
                      onValueChange={v => {
                        const next = [...bulkRows];
                        next[idx] = { ...next[idx], unit: v };
                        setBulkRows(next);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={row.current_stock}
                      onChange={e => {
                        const next = [...bulkRows];
                        next[idx] = { ...next[idx], current_stock: e.target.value };
                        setBulkRows(next);
                      }}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number"
                      value={row.low_stock_threshold}
                      onChange={e => {
                        const next = [...bulkRows];
                        next[idx] = { ...next[idx], low_stock_threshold: e.target.value };
                        setBulkRows(next);
                      }}
                      className="h-8 text-sm"
                    />
                    <button
                      onClick={() => {
                        if (bulkRows.length <= 1) return;
                        setBulkRows(bulkRows.filter((_, i) => i !== idx));
                      }}
                      className="h-8 w-8 rounded flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                      disabled={bulkRows.length <= 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkRows([...bulkRows, emptyBulkRow()])}
                className="w-full"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Row
              </Button>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button
                  onClick={bulkAddIngredients}
                  disabled={bulkAdding || bulkRows.filter(r => r.name.trim()).length === 0}
                >
                  {bulkAdding ? "Adding..." : `Add ${bulkRows.filter(r => r.name.trim()).length} Ingredient(s)`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Restock Dialog */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restock: {selected?.name}</DialogTitle><DialogDescription>Current: {selected?.current_stock} {selected?.unit}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Quantity to Add</Label><Input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="e.g. 50" /></div>
            <div><Label>Notes (optional)</Label><Textarea value={restockNotes} onChange={e => setRestockNotes(e.target.value)} placeholder="e.g. Weekly delivery from supplier" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockOpen(false)}>Cancel</Button>
            <Button onClick={() => restockMutation.mutate()} disabled={!restockQty || restockMutation.isPending}>
              {restockMutation.isPending ? "Restocking..." : "Restock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Menu Items Dialog — M1: reset link state on close */}
      <Dialog open={linkOpen} onOpenChange={(open) => {
        setLinkOpen(open);
        if (!open) {
          setLinkItemId(""); setLinkQty("1");
          setLinkRecipeUnit(""); setLinkFactor("1"); setLinkSuggestion(null);
          setBulkLinkItems([]); setLinkSearch("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Menu Items: {selected?.name}</DialogTitle>
            <DialogDescription>
              Stored in <strong>{selected?.unit}</strong>. Set how much each menu item uses, in any unit.
            </DialogDescription>
          </DialogHeader>

          {/* Existing links */}
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {(linksQuery.data || []).map(link => {
              const hasConversion = link.recipe_unit && link.recipe_unit !== selected?.unit;
              return (
                <div key={link.id} className="flex items-center justify-between border rounded-lg px-3 py-2 gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-sm">{(link as any).menu_items?.name || "Unknown"}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {hasConversion ? (
                        <>
                          <span className="text-primary font-medium">
                            {link.quantity_needed} {link.recipe_unit}
                          </span>
                          {" → "}
                          <span>
                            {formatFactor(link.quantity_needed * (link.conversion_factor ?? 1))} {selected?.unit} per item
                          </span>
                        </>
                      ) : (
                        <span>{link.quantity_needed} {selected?.unit} per item</span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => unlinkMutation.mutate(link.id)}>
                    <Unlink className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {(linksQuery.data || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No menu items linked yet.</p>
            )}
          </div>

          {/* Add new links — multi-select */}
          <div className="border-t pt-4 space-y-3">
            <Label>Link Menu Items <Badge variant="secondary" className="ml-1 text-[10px]">{bulkLinkItems.length} selected</Badge></Label>

            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                placeholder="Search menu items…"
                className="h-8 text-sm pl-8"
              />
            </div>

            {/* Checkbox list of menu items */}
            <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
              {(() => {
                const existingIds = new Set((linksQuery.data || []).map(l => l.menu_item_id));
                const allMenuItems = (menuItemsQuery.data || []).filter(m => !existingIds.has(m.id));
                const filtered = linkSearch.trim()
                  ? allMenuItems.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase()))
                  : allMenuItems;

                if (filtered.length === 0) {
                  return <p className="text-xs text-muted-foreground text-center py-4">No unlinked menu items found.</p>;
                }

                return filtered.map(m => {
                  const checked = bulkLinkItems.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          if (v) {
                            setBulkLinkItems(prev => [...prev, m.id]);
                          } else {
                            setBulkLinkItems(prev => prev.filter(id => id !== m.id));
                          }
                        }}
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  );
                });
              })()}
            </div>

            {bulkLinkItems.length > 0 && (
              <button
                onClick={() => setBulkLinkItems([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear selection
              </button>
            )}

            {/* Quantity + Recipe unit */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Quantity in recipe</Label>
                <Input
                  type="number"
                  value={linkQty}
                  onChange={e => setLinkQty(e.target.value)}
                  placeholder="e.g. 2"
                  min="0.001" step="0.001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Recipe unit</Label>
                <Select
                  value={linkRecipeUnit || selected?.unit || ""}
                  onValueChange={v => {
                    setLinkRecipeUnit(v);
                    setLinkSuggestion(null);
                    if (v === selected?.unit) { setLinkFactor("1"); }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(getUnitsByCategory()).map(([cat, units]) => (
                      units.length === 0 ? null : (
                        <div key={cat}>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {UNIT_CATEGORIES[cat as UnitCategory]}
                          </div>
                          {units.map(u => (
                            <SelectItem key={u.symbol} value={u.symbol}>{u.label}</SelectItem>
                          ))}
                        </div>
                      )
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conversion factor — shown when recipe unit ≠ storage unit */}
            {linkRecipeUnit && linkRecipeUnit !== selected?.unit && (
              <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    1 {linkRecipeUnit} = ? {selected?.unit}
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const hint = getSuggestedConversion(
                        selected?.name ?? "",
                        linkRecipeUnit,
                        selected?.unit ?? "",
                      );
                      if (hint) {
                        setLinkFactor(String(hint.factor));
                        setLinkSuggestion({ label: hint.label, note: hint.note });
                      } else {
                        setLinkSuggestion({ label: "No suggestion found — enter manually", note: undefined });
                      }
                    }}
                  >
                    <Lightbulb className="h-3 w-3" /> Suggest
                  </Button>
                </div>

                <Input
                  type="number"
                  value={linkFactor}
                  onChange={e => { setLinkFactor(e.target.value); setLinkSuggestion(null); }}
                  placeholder="Conversion factor"
                  min="0.000001" step="0.000001"
                />

                {linkSuggestion && (
                  <p className={`text-xs ${linkSuggestion.note ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                    {linkSuggestion.note
                      ? `💡 ${linkSuggestion.label} — ${linkSuggestion.note}`
                      : `⚠️ ${linkSuggestion.label}`
                    }
                  </p>
                )}

                {/* Live preview */}
                {parseFloat(linkQty) > 0 && parseFloat(linkFactor) > 0 && (
                  <div className="rounded bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                    Preview: {linkQty} {linkRecipeUnit} × {linkFactor} = {" "}
                    <strong>
                      {formatFactor(parseFloat(linkQty) * parseFloat(linkFactor))} {selected?.unit}
                    </strong>
                    {" "} deducted from stock per item ordered
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={() => bulkLinkMutation.mutate()}
              disabled={bulkLinkItems.length === 0 || !linkQty || parseFloat(linkQty) <= 0 || bulkLinkMutation.isPending}
              className="w-full"
            >
              {bulkLinkMutation.isPending
                ? "Linking..."
                : linkRecipeUnit && linkRecipeUnit !== selected?.unit
                  ? `Link ${bulkLinkItems.length} item(s) — uses ${linkQty} ${linkRecipeUnit} (= ${formatFactor(parseFloat(linkQty) * (parseFloat(linkFactor) || 1))} ${selected?.unit}) each`
                  : `Link ${bulkLinkItems.length} item(s) — uses ${linkQty || "?"} ${selected?.unit} each`
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Stock History: {selected?.name}</DialogTitle></DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {(historyQuery.data || []).map(m => (
              <div key={m.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                <div>
                  <Badge variant={m.change_qty > 0 ? "default" : "destructive"} className="mr-2">
                    {m.change_qty > 0 ? "+" : ""}{m.change_qty}
                  </Badge>
                  <span className="capitalize">{m.reason.replace("_", " ")}</span>
                  {m.notes && <span className="text-muted-foreground ml-1">— {m.notes}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {(historyQuery.data || []).length === 0 && <p className="text-center text-muted-foreground py-4">No stock movements yet.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Ingredient Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Ingredient</DialogTitle><DialogDescription>Update ingredient details.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Current Stock</Label><Input type="number" value={form.current_stock} onChange={e => setForm(p => ({ ...p, current_stock: e.target.value }))} /></div>
            </div>
            <div><Label>Low Stock Threshold</Label><Input type="number" value={form.low_stock_threshold} onChange={e => setForm(p => ({ ...p, low_stock_threshold: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!form.name.trim() || editMutation.isPending}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Ingredient Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ingredient</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this ingredient, all its menu item links, and stock history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
