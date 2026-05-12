import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { FeatureGate } from "../components/FeatureGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { formatMoney, toCents, fromCents } from "@/lib/formatting";
import { getCurrencySymbol } from "@/lib/currency-utils";

export default function DeliveryZones() {
  return (
    <FeatureGate featureKey="delivery_zones" featureName="Delivery Zones" description="Configure delivery areas, zone-based pricing, minimum order values, and estimated delivery times.">
      <DeliveryZonesContent />
    </FeatureGate>
  );
}

function DeliveryZonesContent() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const cc = restaurant?.currency_code || "INR";

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", radius_km: "5", delivery_charge_cents: "0", min_order_cents: "0", est_time_mins: "30" });

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["delivery-zones", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .order("radius_km", { ascending: true });
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        restaurant_id: restaurant!.id,
        name: form.name.trim(),
        radius_km: parseFloat(form.radius_km) || 5,
        delivery_charge_cents: toCents(form.delivery_charge_cents),
        min_order_cents: toCents(form.min_order_cents),
        est_time_mins: parseInt(form.est_time_mins) || 30,
      };
      if (editId) {
        const { error } = await supabase.from("delivery_zones").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_zones").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editId ? "Zone updated" : "Zone created" });
      resetForm();
      qc.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("delivery_zones").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery-zones"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Zone deleted" });
      qc.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
  });

  const resetForm = () => {
    setForm({ name: "", radius_km: "5", delivery_charge_cents: "0", min_order_cents: "0", est_time_mins: "30" });
    setShowForm(false);
    setEditId(null);
  };

  const startEdit = (z: any) => {
    setForm({
      name: z.name,
      radius_km: String(z.radius_km),
      delivery_charge_cents: String(fromCents(z.delivery_charge_cents)),
      min_order_cents: String(fromCents(z.min_order_cents)),
      est_time_mins: String(z.est_time_mins),
    });
    setEditId(z.id);
    setShowForm(true);
  };

  return (
    <section className="flex flex-col gap-6 w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><MapPin className="h-6 w-6" /> Delivery Zones</h1>
          <p className="text-sm text-muted-foreground">Define delivery areas, charges, and estimated times</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}><Plus className="h-4 w-4 mr-2" /> Add Zone</Button>
      </header>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{editId ? "Edit Zone" : "New Zone"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2"><Label>Zone Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Downtown, Suburbs" /></div>
              <div className="space-y-2"><Label>Radius (km)</Label><Input type="number" step="0.5" value={form.radius_km} onChange={e => setForm({ ...form, radius_km: e.target.value })} /></div>
              <div className="space-y-2"><Label>Delivery Charge ({getCurrencySymbol(cc)})</Label><Input type="number" step="0.01" placeholder="e.g. 50" value={form.delivery_charge_cents} onChange={e => setForm({ ...form, delivery_charge_cents: e.target.value })} /></div>
              <div className="space-y-2"><Label>Min Order ({getCurrencySymbol(cc)})</Label><Input type="number" step="0.01" placeholder="e.g. 200" value={form.min_order_cents} onChange={e => setForm({ ...form, min_order_cents: e.target.value })} /></div>
              <div className="space-y-2"><Label>Est. Time (mins)</Label><Input type="number" value={form.est_time_mins} onChange={e => setForm({ ...form, est_time_mins: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}><Save className="h-4 w-4 mr-2" /> {saveMutation.isPending ? "Saving..." : "Save"}</Button>
              <Button variant="outline" onClick={resetForm}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}
        {zones.map((z: any) => (
          <Card key={z.id} className={!z.is_active ? "opacity-50" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><MapPin className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h3 className="font-semibold">{z.name}</h3>
                    <p className="text-xs text-muted-foreground">{z.radius_km} km radius</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <Badge variant="outline">Charge: {formatMoney(z.delivery_charge_cents, cc)}</Badge>
                  <Badge variant="outline">Min: {formatMoney(z.min_order_cents, cc)}</Badge>
                  <Badge variant="outline">~{z.est_time_mins} min</Badge>
                  <Switch checked={z.is_active} onCheckedChange={v => toggleMutation.mutate({ id: z.id, is_active: v })} />
                  <Button variant="ghost" size="icon" onClick={() => startEdit(z)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(z.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && zones.length === 0 && <p className="text-center text-muted-foreground py-8">No delivery zones configured</p>}
      </div>
    </section>
  );
}
