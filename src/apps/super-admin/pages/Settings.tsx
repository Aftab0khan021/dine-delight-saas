import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

function getEnvironmentLabel() {
  const mode = import.meta.env.MODE;
  return mode === "production" ? "prod" : "dev";
}

export default function SuperAdminSettings() {
  const appName = import.meta.env.VITE_APP_NAME || "Restaurant SaaS";
  const environment = getEnvironmentLabel();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch platform settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('platform_settings')
        .select('*');

      if (error) throw error;

      // Convert array to object for easier access
      const settingsObj: Record<string, any> = {};
      data?.forEach((setting: any) => {
        settingsObj[setting.key] = setting.value;
      });

      return settingsObj;
    },
  });

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await (supabase as any)
        .from('platform_settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-setting-manual-controls'] });
      toast({
        title: "Success",
        description: "Setting updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
      console.error('Error updating setting:', error);
    },
  });

  const handleToggleSetting = (key: string, currentValue: boolean) => {
    updateSettingMutation.mutate({ key, value: !currentValue });
  };

  const manualControlsEnabled = settings?.manual_subscription_controls_enabled === true ||
    settings?.manual_subscription_controls_enabled === 'true';

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform-level configuration and feature flags</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Platform Info</CardTitle>
            <CardDescription>Read-only environment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input value={appName} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Input value={environment} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Platform Name</Label>
              <Input
                value={settings?.platform_name || 'Restaurant SaaS'}
                readOnly
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Features</CardTitle>
            <CardDescription>Control subscription management capabilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 flex-1">
                <Label>Manual Subscription Controls</Label>
                <p className="text-sm text-muted-foreground">
                  Enable manual subscription overrides (extend, discount, upgrade)
                </p>
              </div>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Switch
                  checked={manualControlsEnabled}
                  onCheckedChange={() =>
                    handleToggleSetting('manual_subscription_controls_enabled', manualControlsEnabled)
                  }
                  disabled={updateSettingMutation.isPending}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature Flags</CardTitle>
            <CardDescription>Global platform features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>New Signups Enabled</Label>
                <p className="text-sm text-muted-foreground">Allow new restaurant registrations</p>
              </div>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Switch
                  checked={settings?.new_signups_enabled === true}
                  onCheckedChange={() =>
                    handleToggleSetting('new_signups_enabled', settings?.new_signups_enabled === true)
                  }
                  disabled={updateSettingMutation.isPending}
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">Temporarily disable public access</p>
              </div>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Switch
                  checked={settings?.maintenance_mode === true}
                  onCheckedChange={() =>
                    handleToggleSetting('maintenance_mode', settings?.maintenance_mode === true)
                  }
                  disabled={updateSettingMutation.isPending}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limits</CardTitle>
            <CardDescription>Platform-wide limits and quotas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Max Restaurants</Label>
              <Input
                value={settings?.max_restaurants || '1000'}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input
                value={settings?.support_email || 'support@example.com'}
                readOnly
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
