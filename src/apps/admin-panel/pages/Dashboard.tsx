import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, DollarSign, ShoppingCart, TrendingUp, Users } from "lucide-react";

// Mock data
const stats = [
  {
    title: "Total Revenue",
    value: "$12,345",
    change: "+12.5%",
    icon: DollarSign,
    trend: "up",
  },
  {
    title: "Orders Today",
    value: "43",
    change: "+8.2%",
    icon: ShoppingCart,
    trend: "up",
  },
  {
    title: "Active Staff",
    value: "12",
    change: "+2",
    icon: Users,
    trend: "up",
  },
  {
    title: "Avg Order Value",
    value: "$28.67",
    change: "+5.3%",
    icon: TrendingUp,
    trend: "up",
  },
];

const recentOrders = [
  { id: "#1234", customer: "John Doe", amount: "$45.00", status: "Completed", time: "10m ago" },
  { id: "#1235", customer: "Jane Smith", amount: "$32.50", status: "Preparing", time: "15m ago" },
  { id: "#1236", customer: "Bob Johnson", amount: "$67.80", status: "New", time: "20m ago" },
];

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/auth");
        return;
      }
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/admin/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>{stat.title}</CardDescription>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <ArrowUpRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400">{stat.change}</span>
                  <span>from last period</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest orders from your restaurant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{order.id}</p>
                      <p className="text-sm text-muted-foreground">{order.customer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-semibold">{order.amount}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      order.status === "Completed" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                      order.status === "Preparing" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                      "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                    }`}>
                      {order.status}
                    </span>
                    <span className="text-sm text-muted-foreground">{order.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
