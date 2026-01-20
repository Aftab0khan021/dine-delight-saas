import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Mock data
const orders = [
  { id: "#1240", customer: "Alice Brown", items: 3, amount: "$52.30", status: "New", time: "2m ago" },
  { id: "#1239", customer: "Charlie Davis", items: 2, amount: "$38.90", status: "Preparing", time: "8m ago" },
  { id: "#1238", customer: "Emma Wilson", items: 4, amount: "$76.50", status: "Ready", time: "12m ago" },
  { id: "#1237", customer: "Frank Miller", items: 1, amount: "$24.00", status: "Completed", time: "25m ago" },
  { id: "#1236", customer: "Grace Lee", items: 5, amount: "$89.40", status: "Completed", time: "35m ago" },
];

export default function Orders() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Orders</h1>
            <p className="text-muted-foreground">Manage all restaurant orders</p>
          </div>
          <Button>Refresh Orders</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Orders</CardTitle>
            <CardDescription>View and manage customer orders in real-time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{order.id}</p>
                      <Badge variant={
                        order.status === "New" ? "destructive" :
                        order.status === "Preparing" ? "default" :
                        order.status === "Ready" ? "secondary" :
                        "outline"
                      }>
                        {order.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{order.customer}</p>
                    <p className="text-xs text-muted-foreground">{order.items} items • {order.time}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-lg">{order.amount}</p>
                    <Button size="sm" variant="outline">View Details</Button>
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
