import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Paintbrush, Save, Globe, Image, Palette } from "lucide-react";

export default function WhiteLabel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [platformName, setPlatformName] = useState("Dine Delight");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [accentColor, setAccentColor] = useState("#8b5cf6");
  const [customDomain, setCustomDomain] = useState("");
  const [supportEmail, setSupportEmail] = useState("");

  const { data: config, isLoading } = useQuery({
    queryKey: ["platform-config", "branding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_config")
        .select("id, key, value, updated_at")
        .eq("key", "branding")
        .maybeSingle();
      return data?.value || {};
    },
  });

  useEffect(() => {
    if (!config) return;
    setPlatformName(config.platform_name || "Dine Delight");
    setLogoUrl(config.logo_url || "");
    setFaviconUrl(config.favicon_url || "");
    setPrimaryColor(config.primary_color || "#6366f1");
    setAccentColor(config.accent_color || "#8b5cf6");
    setCustomDomain(config.custom_domain || "");
    setSupportEmail(config.support_email || "");
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const value = {
        platform_name: platformName.trim(),
        logo_url: logoUrl.trim(),
        favicon_url: faviconUrl.trim(),
        primary_color: primaryColor,
        accent_color: accentColor,
        custom_domain: customDomain.trim(),
        support_email: supportEmail.trim(),
      };
      const { error } = await supabase.from("platform_config").upsert({ key: "branding", value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "White-label settings updated." });
      qc.invalidateQueries({ queryKey: ["platform-config"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <section className="flex flex-col gap-6 w-full max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Paintbrush className="h-6 w-6" /> White-Label</h1>
        <p className="text-sm text-muted-foreground">Customize platform branding for your deployment</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Platform Identity</CardTitle>
          <CardDescription>These settings control how the platform appears to all users</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Platform Name</Label>
              <Input value={platformName} onChange={e => setPlatformName(e.target.value)} placeholder="Dine Delight" />
            </div>
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@example.com" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Custom Domain</Label>
              <Input value={customDomain} onChange={e => setCustomDomain(e.target.value)} placeholder="orders.yourbrand.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Image className="h-5 w-5" /> Logo & Favicon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
              {logoUrl && <img src={logoUrl} alt="Logo preview" className="h-12 rounded border bg-muted p-1 object-contain" />}
            </div>
            <div className="space-y-2">
              <Label>Favicon URL</Label>
              <Input value={faviconUrl} onChange={e => setFaviconUrl(e.target.value)} placeholder="https://..." />
              {faviconUrl && <img src={faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded border bg-muted p-0.5 object-contain" />}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Brand Colors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer border" />
                <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Accent Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer border" />
                <Input value={accentColor} onChange={e => setAccentColor(e.target.value)} className="flex-1 font-mono" />
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl border" style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${accentColor}15)` }}>
            <p className="text-sm font-medium mb-2">Preview</p>
            <div className="flex gap-2">
              <span className="px-3 py-1.5 rounded-full text-white text-sm font-medium" style={{ backgroundColor: primaryColor }}>Primary</span>
              <span className="px-3 py-1.5 rounded-full text-white text-sm font-medium" style={{ backgroundColor: accentColor }}>Accent</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="self-end">
        <Save className="h-4 w-4 mr-2" /> {saveMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </section>
  );
}
