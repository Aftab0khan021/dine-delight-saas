import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Image as ImageIcon, Palette, Save, Store, X, Phone, Mail } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

// --- Validation Schema (Restored from your original file) ---
const hexSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6})$/, "Use 6-digit hex (e.g. #1A2B3C)")
  .optional()
  .or(z.literal(""));

const formSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  contact_email: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  logo_url: z.string().trim().url("Enter a valid URL").max(2000).optional().or(z.literal("")),
  cover_image_url: z.string().trim().url("Enter a valid URL").max(2000).optional().or(z.literal("")),
  primary_color: hexSchema,
  accent_color: hexSchema,
});

type BrandingFormValues = z.infer<typeof formSchema>;

// --- Helpers ---
function getPublicUrl(slug: string) {
  // Uses the current window origin + /r/ + slug
  return `${window.location.origin}/r/${slug}`;
}

function normalizeSettings(settings: any | null) {
  return (settings && typeof settings === "object" && !Array.isArray(settings)) ? settings : {};
}

export default function AdminBranding() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  // --- Data Fetching ---
  const { data: restaurantData, isLoading } = useQuery({
    queryKey: ["admin", "restaurant", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, description, logo_url, slug, settings")
        .eq("id", restaurant!.id)
        .single();
      return data;
    }
  });

  const form = useForm<BrandingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      contact_email: "",
      contact_phone: "",
      logo_url: "",
      cover_image_url: "",
      primary_color: "#000000",
      accent_color: "#ffffff",
    },
    mode: "onChange"
  });

  // Sync data to form
  useEffect(() => {
    if (restaurantData) {
      const s = normalizeSettings(restaurantData.settings);
      form.reset({
        name: restaurantData.name || "",
        description: restaurantData.description || "",
        logo_url: restaurantData.logo_url || "",
        contact_email: s.contact_email || "",
        contact_phone: s.contact_phone || "",
        cover_image_url: s.cover_image_url || "",
        primary_color: s.theme?.primary_color || "#000000",
        accent_color: s.theme?.accent_color || "#ffffff"
      });
    }
  }, [restaurantData]);

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async (values: BrandingFormValues) => {
      // Preserve existing settings while updating specific fields
      const currentSettings = normalizeSettings(restaurantData?.settings);

      const nextSettings = {
        ...currentSettings,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        cover_image_url: values.cover_image_url || null,
        theme: {
          ...(currentSettings.theme ?? {}),
          primary_color: values.primary_color || null,
          accent_color: values.accent_color || null,
        },
      };

      const { error } = await supabase.from("restaurants").update({
        name: values.name,
        description: values.description || null,
        logo_url: values.logo_url || null,
        settings: nextSettings
      }).eq("id", restaurant!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Branding updated successfully." });
      qc.invalidateQueries({ queryKey: ["admin", "restaurant"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  // --- Handlers ---
  const handleCopyLink = () => {
    if (!restaurantData?.slug) return;
    const url = getPublicUrl(restaurantData.slug);
    navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Website URL copied to clipboard." });
  };

  // Watch values for live preview
  const w = form.watch();

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading branding...</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your restaurant profile, contact info, and website appearance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => form.reset()} disabled={saveMutation.isPending}>
            <X className="mr-2 h-4 w-4" /> Reset
          </Button>
          <Button onClick={form.handleSubmit((v) => saveMutation.mutate(v))} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" /> {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Editor Form */}
        <div className="lg:col-span-2 space-y-6">

          {/* Card 1: Basic Info */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                Restaurant Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Restaurant Name *</Label>
                  <Input {...form.register("name")} placeholder="e.g. The Burger Joint" />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea {...form.register("description")} placeholder="Tell customers about your food..." className="h-20 resize-none" />
                </div>

                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input {...form.register("contact_email")} placeholder="info@example.com" />
                  {form.formState.errors.contact_email && <p className="text-xs text-destructive">{form.formState.errors.contact_email.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input {...form.register("contact_phone")} placeholder="+1 (555) 000-0000" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Visuals */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                Visual Assets
              </CardTitle>
              <CardDescription>Enter direct URLs for your images (Uploads coming soon).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input {...form.register("logo_url")} placeholder="https://..." />
                  {form.formState.errors.logo_url && <p className="text-xs text-destructive">{form.formState.errors.logo_url.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Cover Image URL</Label>
                  <Input {...form.register("cover_image_url")} placeholder="https://..." />
                  {form.formState.errors.cover_image_url && <p className="text-xs text-destructive">{form.formState.errors.cover_image_url.message}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Theme */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                Theme Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 rounded border shadow-sm shrink-0" style={{ backgroundColor: w.primary_color || "#000000" }} />
                    <Input {...form.register("primary_color")} placeholder="#000000" />
                  </div>
                  {form.formState.errors.primary_color && <p className="text-xs text-destructive">{form.formState.errors.primary_color.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 rounded border shadow-sm shrink-0" style={{ backgroundColor: w.accent_color || "#ffffff" }} />
                    <Input {...form.register("accent_color")} placeholder="#ffffff" />
                  </div>
                  {form.formState.errors.accent_color && <p className="text-xs text-destructive">{form.formState.errors.accent_color.message}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN: Live Preview & Link */}
        <div className="space-y-6">

          {/* 1. Website Link Card */}
          <Card className="shadow-sm border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Globe className="h-4 w-4" />
                Your Website
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-background p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">Public URL</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate text-xs font-mono bg-muted/50 p-1 rounded">
                    {restaurantData?.slug ? getPublicUrl(restaurantData.slug) : "..."}
                  </code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyLink}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Button className="w-full" variant="outline" asChild>
                <a
                  href={restaurantData?.slug ? getPublicUrl(restaurantData.slug) : "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Visit Live Site
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* 2. Visual Preview Card */}
          <Card className="shadow-sm overflow-hidden sticky top-6">
            <CardHeader className="bg-muted/30 border-b pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mobile Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mockup Container */}
              <div className="relative bg-white min-h-[450px] flex flex-col">

                {/* Header (Cover Image + Logo) */}
                <div className="relative h-32 w-full bg-gray-100">
                  {w.cover_image_url ? (
                    <img src={w.cover_image_url} alt="Cover" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-300 bg-gray-200">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}

                  {/* Logo Overlay */}
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                    <div className="h-16 w-16 rounded-full border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
                      {w.logo_url ? (
                        <img src={w.logo_url} alt="Logo" className="h-full w-full object-cover" />
                      ) : (
                        <Store className="h-8 w-8 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Body Content */}
                <div className="mt-8 px-5 pb-5 text-center flex-1 flex flex-col">
                  <h3 className="font-bold text-lg text-gray-900 leading-tight">
                    {w.name || "Your Restaurant"}
                  </h3>

                  <p className="text-xs text-gray-500 mt-2 line-clamp-3">
                    {w.description || "Delicious food served daily. Order online for pickup or dine-in."}
                  </p>

                  {/* Contact Info Preview */}
                  {(w.contact_email || w.contact_phone) && (
                    <div className="flex justify-center gap-3 mt-3 text-[10px] text-gray-400">
                      {w.contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>}
                      {w.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> Call</span>}
                    </div>
                  )}

                  {/* Mock Items */}
                  <div className="grid grid-cols-2 gap-2 mt-6">
                    <div className="h-24 rounded-lg bg-gray-50 border border-gray-100 animate-pulse"></div>
                    <div className="h-24 rounded-lg bg-gray-50 border border-gray-100 animate-pulse"></div>
                  </div>

                  {/* CTA Button */}
                  <div className="mt-auto pt-6">
                    <div
                      className="w-full py-3 rounded-full text-sm font-bold shadow-lg transition-transform"
                      style={{
                        backgroundColor: w.primary_color || "#000000",
                        color: w.accent_color || "#ffffff"
                      }}
                    >
                      Browse Menu
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}