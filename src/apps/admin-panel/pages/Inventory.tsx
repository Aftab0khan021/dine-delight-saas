import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
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
import { Plus, Package, AlertTriangle, ArrowUpDown, RefreshCw, Link2, Unlink, History } from "lucide-react";

const UNITS = ["g", "kg", "ml", "L", "pcs", "cups", "tbsp", "tsp", "oz", "lb"];

type Ingredient = {
  id: string; name: string; unit: string; current_stock: number;
  low_stock_threshold: number; cost_per_unit_cents: number;
  is_tracked: boolean; created_at: string; updated_at: string; restaurant_id: string;
};

type MenuItemLink = {
  id: string; menu_item_id: string; ingredient_id: string;
  quantity_needed: number; restaurant_id: string;
  menu_items?: { name: string; is_active: boolean };
};

type StockMovement = {
  id: string; change_qty: number; reason: string;
  notes: string | null; created_at: string; reference_id: string | null;
};

export default function Inventory() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({ name: "", unit: "pcs", current_stock: "0", low_stock_threshold: "5", cost_per_unit_cents: "0" });
  const [restockQty, setRestockQty] = useState("");
  const [restockNotes, setRestockNotes] = useState("");
  const [linkItemId, setLinkItemId] = useState("");
  const [linkQty, setLinkQty] = useState("1");
  const [search, setSearch] = useState("");

  // Queries
  const ingredientsQuery = useQuery({
    queryKey: ["ingredients", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ingredients")
        .select("*").eq("restaurant_id", restaurant!.id).order("name");
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
        .select("*").eq("ingredient_id", selected!.id).order("created_at", { ascending: false }).limit(50);
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
        cost_per_unit_cents: parseInt(form.cost_per_unit_cents) || 0,
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
      const { error } = await supabase.from("menu_item_ingredients").insert({
        menu_item_id: linkItemId, ingredient_id: selected!.id,
        quantity_needed: parseFloat(linkQty) || 1, restaurant_id: restaurant!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredient-links"] });
      setLinkItemId(""); setLinkQty("1");
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
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => { setSelected(ing); setRestockOpen(true); }}>
                        <ArrowUpDown className="h-3 w-3 mr-1" /> Restock
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelected(ing); setLinkOpen(true); }}>
                        <Link2 className="h-3 w-3 mr-1" /> Links
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSelected(ing); setHistoryOpen(true); }}>
                        <History className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Ingredient Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Ingredient</DialogTitle><DialogDescription>Track a new ingredient in your inventory.</DialogDescription></DialogHeader>
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

      {/* Link Menu Items Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Link Menu Items: {selected?.name}</DialogTitle><DialogDescription>Set how much of this ingredient each menu item uses.</DialogDescription></DialogHeader>
          {/* Existing links */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(linksQuery.data || []).map(link => (
              <div key={link.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">{(link as any).menu_items?.name || "Unknown"}</span>
                  <span className="text-sm text-muted-foreground ml-2">({link.quantity_needed} {selected?.unit} per item)</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => unlinkMutation.mutate(link.id)}><Unlink className="h-3 w-3" /></Button>
              </div>
            ))}
            {(linksQuery.data || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No menu items linked yet.</p>}
          </div>
          {/* Add new link */}
          <div className="border-t pt-4 space-y-3">
            <Label>Link New Menu Item</Label>
            <div className="flex gap-2">
              <Select value={linkItemId} onValueChange={setLinkItemId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select menu item..." /></SelectTrigger>
                <SelectContent>{(menuItemsQuery.data || []).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={linkQty} onChange={e => setLinkQty(e.target.value)} className="w-24" placeholder="Qty" />
              <Button onClick={() => linkMutation.mutate()} disabled={!linkItemId || linkMutation.isPending}>Link</Button>
            </div>
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
    </div>
  );
}
