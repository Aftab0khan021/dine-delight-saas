import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

function getEnvironmentLabel() {
  // No backend calls; best-effort based on Vite mode.
  // If you publish, Vite builds are typically "production".
  const mode = import.meta.env.MODE;
  return mode === "production" ? "prod" : "dev";
}

export default function SuperAdminSettings() {
  const appName = import.meta.env.VITE_APP_NAME || "Restaurant SaaS";
  const environment = getEnvironmentLabel();

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform-level settings (read-only UI).</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Platform info</CardTitle>
            <CardDescription>Read-only environment details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>App name</Label>
              <Input value={appName} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Input value={environment} readOnly />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature flags</CardTitle>
            <CardDescription>UI placeholders (no mutations).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Public ordering enabled</Label>
                <p className="text-sm text-muted-foreground">Allow public menu browsing and ordering.</p>
              </div>
              <Switch checked disabled />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>QR ordering enabled</Label>
                <p className="text-sm text-muted-foreground">Allow QR code entry points into ordering.</p>
              </div>
              <Switch checked disabled />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Anonymous orders enabled</Label>
                <p className="text-sm text-muted-foreground">Allow orders without account sign-in.</p>
              </div>
              <Switch checked disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limits</CardTitle>
            <CardDescription>UI placeholders (no enforcement yet).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Max orders per hour</Label>
              <Input value="—" readOnly />
            </div>
            <div className="space-y-2">
              <Label>Max QR codes per restaurant</Label>
              <Input value="—" readOnly />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance</CardTitle>
            <CardDescription>UI placeholder (no mutations).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Maintenance mode</Label>
                <p className="text-sm text-muted-foreground">Temporarily disable public access.</p>
              </div>
              <Switch checked={false} disabled />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
