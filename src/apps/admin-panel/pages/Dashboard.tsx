import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboard() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your restaurant.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>Track order status and throughput.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menu</CardTitle>
            <CardDescription>Maintain items, pricing, and availability.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR Menu</CardTitle>
            <CardDescription>Manage QR destinations and tables.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </section>
  );
}
