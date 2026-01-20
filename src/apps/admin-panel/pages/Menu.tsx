import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// Mock data
const menuItems = [
  { id: "1", name: "Margherita Pizza", category: "Pizza", price: "$12.99", available: true },
  { id: "2", name: "Caesar Salad", category: "Salads", price: "$8.50", available: true },
  { id: "3", name: "Pasta Carbonara", category: "Pasta", price: "$14.99", available: true },
  { id: "4", name: "Tiramisu", category: "Desserts", price: "$6.99", available: false },
  { id: "5", name: "Pepperoni Pizza", category: "Pizza", price: "$15.99", available: true },
];

export default function Menu() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Menu Management</h1>
            <p className="text-muted-foreground">Create and manage your menu items</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Menu Items</CardTitle>
            <CardDescription>All items currently on your menu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {menuItems.map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
                      Image
                    </div>
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-lg">{item.price}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      item.available ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                    }`}>
                      {item.available ? "Available" : "Out of Stock"}
                    </span>
                    <Button size="sm" variant="outline">Edit</Button>
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
