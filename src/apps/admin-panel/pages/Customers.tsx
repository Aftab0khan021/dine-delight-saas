import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { FeatureGate } from "../components/FeatureGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Users, Crown, Star, User, ShoppingBag, TrendingUp, Phone, Clock } from "lucide-react";
import { formatMoney } from "@/lib/formatting";
import { format, formatDistanceToNow } from "date-fns";

export default function Customers() {
  return (
    <FeatureGate featureKey="customer_management" featureName="Customer Management" description="CRM database for customer profiles, order history, lifetime value tracking, and loyalty points.">
      <CustomersContent />
    </FeatureGate>
  );
}

function CustomersContent() {
  const { restaurant } = useRestaurantContext();
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      // Fetch all orders for this restaurant, grouped by customer_phone
      const { data: orders } = await supabase
        .from("orders")
        .select("id, customer_phone, customer_name, total_cents, status, created_at")
        .eq("restaurant_id", restaurant!.id)
        .not("customer_phone", "is", null)
        .order("created_at", { ascending: false });

      if (!orders) return [];

      // Group by phone
      const map: Record<string, any> = {};
      for (const o of orders) {
        const phone = o.customer_phone;
        if (!phone) continue;
        if (!map[phone]) {
          map[phone] = {
            phone,
            name: o.customer_name || "Unknown",
            orders: [],
            totalSpent: 0,
            orderCount: 0,
            firstOrder: o.created_at,
            lastOrder: o.created_at,
          };
        }
        map[phone].orders.push(o);
        map[phone].totalSpent += o.total_cents || 0;
        map[phone].orderCount += 1;
        if (o.customer_name && map[phone].name === "Unknown") map[phone].name = o.customer_name;
        if (o.created_at < map[phone].firstOrder) map[phone].firstOrder = o.created_at;
        if (o.created_at > map[phone].lastOrder) map[phone].lastOrder = o.created_at;
      }

      return Object.values(map).sort((a: any, b: any) => b.totalSpent - a.totalSpent);
    },
  });

  // Fetch loyalty points
  const { data: loyaltyMap = {} } = useQuery({
    queryKey: ["admin-loyalty", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_loyalty")
        .select("phone, points")
        .eq("restaurant_id", restaurant!.id);
      const m: Record<string, number> = {};
      data?.forEach(l => { m[l.phone] = l.points; });
      return m;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter((c: any) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, search]);

  const getTag = (c: any) => {
    if (c.orderCount >= 10) return { label: "VIP", color: "bg-amber-500/15 text-amber-700", icon: Crown };
    if (c.orderCount >= 3) return { label: "Regular", color: "bg-blue-500/15 text-blue-700", icon: Star };
    return { label: "New", color: "bg-emerald-500/15 text-emerald-700", icon: User };
  };

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s: number, c: any) => s + c.totalSpent, 0);
  const avgOrderValue = totalCustomers > 0 ? Math.round(totalRevenue / customers.reduce((s: number, c: any) => s + c.orderCount, 0)) : 0;

  const cc = restaurant?.currency_code || "INR";

  return (
    <section className="flex flex-col gap-6 w-full">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" /> Customer CRM</h1>
        <p className="text-sm text-muted-foreground">View all customers, lifetime value, and order history</p>
      </header>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Customers</p><p className="text-2xl font-bold">{totalCustomers}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">{formatMoney(totalRevenue, cc)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Avg Order Value</p><p className="text-2xl font-bold">{formatMoney(avgOrderValue, cc)}</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium">Tag</th>
                  <th className="text-left p-3 font-medium">Orders</th>
                  <th className="text-left p-3 font-medium">Lifetime Value</th>
                  <th className="text-left p-3 font-medium">Loyalty</th>
                  <th className="text-left p-3 font-medium">Last Visit</th>
                  <th className="text-left p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Loading...</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">No customers found</td></tr>}
                {filtered.map((c: any) => {
                  const tag = getTag(c);
                  return (
                    <tr key={c.phone} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</div>
                      </td>
                      <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${tag.color}`}><tag.icon className="h-3 w-3" /> {tag.label}</span></td>
                      <td className="p-3 font-medium">{c.orderCount}</td>
                      <td className="p-3 font-medium">{formatMoney(c.totalSpent, cc)}</td>
                      <td className="p-3"><Badge variant="outline">🪙 {(loyaltyMap as any)[c.phone] || 0}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.lastOrder), { addSuffix: true })}</td>
                      <td className="p-3"><Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(c)}><ShoppingBag className="h-4 w-4" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCustomer?.name}</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Phone:</span> {selectedCustomer.phone}</div>
                <div><span className="text-muted-foreground">Total Orders:</span> {selectedCustomer.orderCount}</div>
                <div><span className="text-muted-foreground">Lifetime Value:</span> {formatMoney(selectedCustomer.totalSpent, cc)}</div>
                <div><span className="text-muted-foreground">First Visit:</span> {format(new Date(selectedCustomer.firstOrder), "PP")}</div>
              </div>
              <h4 className="font-semibold text-sm">Order History</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {selectedCustomer.orders.slice(0, 20).map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                    <div>
                      <span className="font-mono text-xs">#{o.id.slice(0, 8)}</span>
                      <span className="text-muted-foreground ml-2">{format(new Date(o.created_at), "PP")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{o.status}</Badge>
                      <span className="font-medium">{formatMoney(o.total_cents, cc)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
