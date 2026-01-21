import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavLink } from "@/components/NavLink";

export default function SuperAdminDashboard() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform overview and quick actions.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Restaurants</CardTitle>
            <CardDescription>Manage all restaurants on the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <NavLink to="/superadmin/restaurants">View restaurants</NavLink>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Review active subscriptions and status.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <NavLink to="/superadmin/subscriptions">View subscriptions</NavLink>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>View invoice history and payment state.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <NavLink to="/superadmin/invoices">View invoices</NavLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
