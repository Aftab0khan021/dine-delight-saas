import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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

type RestaurantRow = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  settings: any | null;
};

function normalizeSettings(settings: any | null) {
  return (settings && typeof settings === "object" && !Array.isArray(settings)) ? settings : {};
}

export default function AdminBranding() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  const restaurantQuery = useQuery({
    queryKey: ["admin", "branding", restaurant?.id, "restaurant"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, description, logo_url, settings")
        .eq("id", restaurant!.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data as RestaurantRow;
    },
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
      primary_color: "",
      accent_color: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (!restaurantQuery.data) return;

    const s = normalizeSettings(restaurantQuery.data.settings);
    form.reset({
      name: restaurantQuery.data.name ?? "",
      description: restaurantQuery.data.description ?? "",
      logo_url: restaurantQuery.data.logo_url ?? "",
      contact_email: s.contact_email ?? "",
      contact_phone: s.contact_phone ?? "",
      cover_image_url: s.cover_image_url ?? "",
      primary_color: s.theme?.primary_color ?? "",
      accent_color: s.theme?.accent_color ?? "",
    });
  }, [form, restaurantQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (values: BrandingFormValues) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const current = restaurantQuery.data;
      const currentSettings = normalizeSettings(current?.settings ?? null);

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

      const { error } = await supabase
        .from("restaurants")
        .update({
          name: values.name,
          description: values.description || null,
          logo_url: values.logo_url || null,
          settings: nextSettings,
        })
        .eq("id", restaurant.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Branding settings updated." });
      await qc.invalidateQueries({ queryKey: ["admin", "branding", restaurant?.id, "restaurant"] });
      // keep context restaurant name in sync
      await qc.invalidateQueries({ queryKey: ["admin", "restaurantContext"] }).catch(() => {});
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const preview = useMemo(() => {
    const v = form.getValues();
    return {
      name: v.name || "Your Restaurant",
      logo: v.logo_url || null,
      primary: v.primary_color || "#111111",
    };
  }, [form.watch("name"), form.watch("logo_url"), form.watch("primary_color")]);

  const hasConfiguredBranding = useMemo(() => {
    const row = restaurantQuery.data;
    const s = normalizeSettings(row?.settings ?? null);
    return Boolean(row?.logo_url || s.cover_image_url || s.contact_email || s.contact_phone || s.theme?.primary_color);
  }, [restaurantQuery.data]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Branding</h1>
        <p className="text-sm text-muted-foreground">Update your restaurant details and brand styling.</p>
      </header>

      {restaurantQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading branding…</p>
      ) : restaurantQuery.isError ? (
        <div className="rounded-lg border border-dashed p-6">
          <p className="font-medium">Couldn’t load branding</p>
          <p className="text-sm text-muted-foreground">{(restaurantQuery.error as any)?.message ?? "Please try again."}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Restaurant info</CardTitle>
              <CardDescription>These details are saved to your restaurant record.</CardDescription>
            </CardHeader>
            <CardContent>
              {!hasConfiguredBranding ? (
                <div className="mb-4 rounded-lg border border-dashed p-4">
                  <p className="text-sm font-medium">Not configured yet</p>
                  <p className="text-sm text-muted-foreground">Add a logo and contact details to complete your setup.</p>
                </div>
              ) : null}

              <form
                className="space-y-6"
                onSubmit={form.handleSubmit(async (values) => {
                  await saveMutation.mutateAsync(values);
                })}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="name">Restaurant name</Label>
                    <Input id="name" {...form.register("name")} />
                    {form.formState.errors.name?.message ? (
                      <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" rows={3} {...form.register("description")} placeholder="Optional" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Contact email</Label>
                    <Input id="contact_email" inputMode="email" {...form.register("contact_email")} placeholder="support@…" />
                    {form.formState.errors.contact_email?.message ? (
                      <p className="text-sm text-destructive">{form.formState.errors.contact_email.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_phone">Contact phone</Label>
                    <Input id="contact_phone" {...form.register("contact_phone")} placeholder="+1 …" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Branding assets</p>
                    <p className="text-sm text-muted-foreground">URLs only (no uploads yet).</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="logo_url">Logo URL</Label>
                      <Input id="logo_url" {...form.register("logo_url")} placeholder="https://…" />
                      {form.formState.errors.logo_url?.message ? (
                        <p className="text-sm text-destructive">{form.formState.errors.logo_url.message}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cover_image_url">Cover image URL</Label>
                      <Input id="cover_image_url" {...form.register("cover_image_url")} placeholder="https://…" />
                      {form.formState.errors.cover_image_url?.message ? (
                        <p className="text-sm text-destructive">{form.formState.errors.cover_image_url.message}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Theme settings</p>
                    <p className="text-sm text-muted-foreground">Store brand colors for your public menu.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="primary_color">Primary color</Label>
                      <Input id="primary_color" placeholder="#111111" {...form.register("primary_color")} />
                      {form.formState.errors.primary_color?.message ? (
                        <p className="text-sm text-destructive">{form.formState.errors.primary_color.message as any}</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="accent_color">Accent color</Label>
                      <Input id="accent_color" placeholder="#FF5500" {...form.register("accent_color")} />
                      {form.formState.errors.accent_color?.message ? (
                        <p className="text-sm text-destructive">{form.formState.errors.accent_color.message as any}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (restaurantQuery.data) {
                        const s = normalizeSettings(restaurantQuery.data.settings);
                        form.reset({
                          name: restaurantQuery.data.name ?? "",
                          description: restaurantQuery.data.description ?? "",
                          logo_url: restaurantQuery.data.logo_url ?? "",
                          contact_email: s.contact_email ?? "",
                          contact_phone: s.contact_phone ?? "",
                          cover_image_url: s.cover_image_url ?? "",
                          primary_color: s.theme?.primary_color ?? "",
                          accent_color: s.theme?.accent_color ?? "",
                        });
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending || !form.formState.isValid}>
                    {saveMutation.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Quick look at your branding.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-md border bg-muted overflow-hidden">
                    {preview.logo ? (
                      <img src={preview.logo} alt="Restaurant logo" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{preview.name}</p>
                    <p className="text-sm text-muted-foreground">Primary: {preview.primary}</p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full" style={{ backgroundColor: preview.primary }} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
