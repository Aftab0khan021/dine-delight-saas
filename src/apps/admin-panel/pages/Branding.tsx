import { useEffect, useMemo, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Image as ImageIcon, Palette, Save, Store, X, Phone, Mail, Clock, DollarSign, Upload, Loader2, MapPin, Instagram, Facebook, Twitter, Youtube, MessageCircle, Star, Plus, Trash2, CalendarDays, Filter, Users, Link2, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { OperatingHoursEditor } from "../components/branding/OperatingHoursEditor";
import { SocialLinksCard } from "../components/branding/SocialLinksCard";
import { TestimonialsCard, type Testimonial } from "../components/branding/TestimonialsCard";
import { BrandingPreview } from "../components/branding/BrandingPreview";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

// --- Validation Schema (Restored from your original file) ---
const hexSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6})$/, "Use 6-digit hex (e.g. #1A2B3C)")
  .optional()
  .or(z.literal(""));

const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters")
  .max(80, "Slug must be at most 80 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Only lowercase letters, numbers, and hyphens (no leading/trailing hyphens)");

const formSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required").max(120),
  slug: slugSchema,
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  contact_email: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  google_maps_url: z.string().trim().max(2000).optional().or(z.literal("")),
  logo_url: z.string().trim().max(2000).optional().or(z.literal("")),
  cover_image_url: z.string().trim().max(2000).optional().or(z.literal("")),
  primary_color: hexSchema,
  accent_color: hexSchema,
  currency_code: z.string().min(3).max(3),
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

  // Check if custom domain feature is enabled
  const { isFeatureEnabled } = useFeatureAccess(restaurant?.id);
  const customDomainEnabled = isFeatureEnabled('custom_domain');

  // Operating hours state
  const [operatingHours, setOperatingHours] = useState<any>({
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });
  const [isHolidayMode, setIsHolidayMode] = useState(false);
  const [holidayMessage, setHolidayMessage] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [maxVariants, setMaxVariants] = useState(5);

  // --- NEW: Enhancement settings (stored in settings JSONB) ---
  const [socialLinks, setSocialLinks] = useState({ instagram: "", facebook: "", twitter: "", youtube: "" });
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [totalTables, setTotalTables] = useState(10);
  const [dietaryFiltersEnabled, setDietaryFiltersEnabled] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  // --- Data Fetching ---
  const { data: restaurantData, isLoading } = useQuery({
    queryKey: ["admin", "restaurant", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, description, logo_url, slug, settings, operating_hours, is_holiday_mode, holiday_mode_message, max_variants_per_item, currency_code")
        .eq("id", restaurant!.id)
        .single();
      return data;
    }
  });

  const form = useForm<BrandingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      contact_email: "",
      contact_phone: "",
      address: "",
      google_maps_url: "",
      logo_url: "",
      cover_image_url: "",
      primary_color: "#000000",
      accent_color: "#ffffff",
      currency_code: "INR",
    },
    mode: "onChange"
  });

  // Sync data to form
  useEffect(() => {
    if (restaurantData) {
      const s = normalizeSettings(restaurantData.settings);
      form.reset({
        name: restaurantData.name || "",
        slug: restaurantData.slug || "",
        description: restaurantData.description || "",
        logo_url: restaurantData.logo_url || "",
        contact_email: s.contact_email || "",
        contact_phone: s.contact_phone || "",
        address: s.address || "",
        google_maps_url: s.google_maps_url || "",
        cover_image_url: s.cover_image_url || "",
        primary_color: s.theme?.primary_color || "#000000",
        accent_color: s.theme?.accent_color || "#ffffff",
        currency_code: restaurantData.currency_code || "INR"
      });

      // Sync operating hours
      if (restaurantData.operating_hours && typeof restaurantData.operating_hours === 'object') {
        setOperatingHours(restaurantData.operating_hours);
      }
      setIsHolidayMode(restaurantData.is_holiday_mode || false);
      setHolidayMessage(restaurantData.holiday_mode_message || "");
      setMaxVariants(restaurantData.max_variants_per_item || 5);

      // Sync enhancement settings
      setSocialLinks(s.social_links || { instagram: "", facebook: "", twitter: "", youtube: "" });
      setGalleryImages(Array.isArray(s.gallery_images) ? s.gallery_images : []);
      setTestimonials(Array.isArray(s.testimonials) ? s.testimonials : []);
      setWhatsappNumber(s.whatsapp_number || "");
      setReservationEnabled(!!s.reservation_enabled);
      setTotalTables(s.total_tables || 10);
      setDietaryFiltersEnabled(!!s.dietary_filters_enabled);
    }
  }, [restaurantData]);

  // --- Slug helpers ---
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  function nameToSlug(name: string) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
      .replace(/\s+/g, '-')            // spaces → hyphens
      .replace(/-+/g, '-')             // collapse multiple hyphens
      .replace(/^-|-$/g, '');           // trim leading/trailing hyphens
  }

  const checkSlugAvailability = useCallback(async (slug: string) => {
    if (!slug || slug.length < 2 || !restaurant?.id) return;
    // If slug hasn't changed from the current one, it's "available" (it's ours)
    if (slug === restaurantData?.slug) {
      setSlugStatus('available');
      return;
    }
    setSlugStatus('checking');
    const { data } = await supabase
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .neq('id', restaurant.id)
      .maybeSingle();
    setSlugStatus(data ? 'taken' : 'available');
  }, [restaurant?.id, restaurantData?.slug]);

  const handleGenerateSlug = () => {
    const name = form.getValues('name');
    if (!name) return;
    const generated = nameToSlug(name);
    if (generated) {
      form.setValue('slug', generated, { shouldDirty: true, shouldValidate: true });
      setSlugManuallyEdited(false);
      checkSlugAvailability(generated);
    }
  };

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async (values: BrandingFormValues) => {
      // Check slug uniqueness before saving
      if (values.slug !== restaurantData?.slug) {
        const { data: existing } = await supabase
          .from('restaurants')
          .select('id')
          .eq('slug', values.slug)
          .neq('id', restaurant!.id)
          .maybeSingle();
        if (existing) {
          throw new Error(`The URL slug "${values.slug}" is already taken by another restaurant. Please choose a different one.`);
        }
      }

      // Preserve existing settings while updating specific fields
      const currentSettings = normalizeSettings(restaurantData?.settings);

      const nextSettings = {
        ...currentSettings,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        address: values.address || null,
        google_maps_url: values.google_maps_url || null,
        cover_image_url: values.cover_image_url || null,
        theme: {
          ...(currentSettings.theme ?? {}),
          primary_color: values.primary_color || null,
          accent_color: values.accent_color || null,
        },
        // Enhancement settings
        social_links: socialLinks,
        gallery_images: galleryImages,
        testimonials,
        whatsapp_number: whatsappNumber || null,
        reservation_enabled: reservationEnabled,
        total_tables: totalTables,
        dietary_filters_enabled: dietaryFiltersEnabled,
      };

      const { error } = await supabase.from("restaurants").update({
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        logo_url: values.logo_url || null,
        currency_code: values.currency_code,
        settings: nextSettings,
        operating_hours: operatingHours,
        is_holiday_mode: isHolidayMode,
        holiday_mode_message: holidayMessage || null,
        max_variants_per_item: maxVariants
      }).eq("id", restaurant!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Branding updated successfully." });
      qc.invalidateQueries({ queryKey: ["admin", "restaurant"] });
      setSlugStatus('idle');
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  // --- Handlers ---
  const handleCopyLink = () => {
    const currentSlug = form.getValues('slug') || restaurantData?.slug;
    if (!currentSlug) return;
    const url = getPublicUrl(currentSlug);
    navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Website URL copied to clipboard." });
  };

  // --- Image Upload Handler ---
  const handleBrandingImageUpload = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logo_url' | 'cover_image_url',
    setLoading: (v: boolean) => void
  ) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload a PNG, JPEG, WebP, or SVG image.', variant: 'destructive' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 5MB.', variant: 'destructive' });
      return;
    }

    const fileExt = file.name.split('.').pop();
    const prefix = field === 'logo_url' ? 'logo' : 'cover';
    const fileName = `${prefix}-${restaurant?.id}-${Date.now()}.${fileExt}`;

    setLoading(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from('menu-items')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('menu-items')
        .getPublicUrl(fileName);

      form.setValue(field, data.publicUrl, { shouldDirty: true });
      toast({ title: 'Uploaded', description: `${prefix === 'logo' ? 'Logo' : 'Cover image'} uploaded successfully.` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      // Reset file input so the same file can be re-selected
      e.target.value = '';
    }
  }, [restaurant?.id, form, toast]);

  // Watch values for live preview
  const w = form.watch();

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading branding...</div>;

  return (
    <div className="flex flex-col gap-4 w-full">
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

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
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
                  <Input
                    {...form.register("name", {
                      onChange: (e) => {
                        // Auto-generate slug from name if user hasn't manually edited slug
                        if (!slugManuallyEdited) {
                          const generated = nameToSlug(e.target.value);
                          if (generated) {
                            form.setValue('slug', generated, { shouldValidate: true });
                            checkSlugAvailability(generated);
                          }
                        }
                      }
                    })}
                    placeholder="e.g. The Burger Joint"
                  />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>

                {/* Restaurant URL Slug */}
                <div className="space-y-2 sm:col-span-2">
                  <Label className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    Restaurant URL Slug *
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        {...form.register("slug", {
                          onChange: (e) => {
                            setSlugManuallyEdited(true);
                            checkSlugAvailability(e.target.value);
                          }
                        })}
                        placeholder="my-restaurant"
                        className="pr-8"
                      />
                      {/* Status indicator */}
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {slugStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {slugStatus === 'available' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {slugStatus === 'taken' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerateSlug}
                      title="Auto-generate from restaurant name"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {form.formState.errors.slug && <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>}
                  {slugStatus === 'taken' && <p className="text-xs text-destructive">This slug is already taken. Please choose a different one.</p>}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {window.location.origin}/r/<strong className="text-foreground">{w.slug || '...'}</strong>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">This is the URL customers use to find your restaurant. Changing it will break old links.</p>
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

              {/* Address / Location */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Restaurant Address
                </Label>
                <Textarea
                  {...form.register("address")}
                  placeholder="123 Main Street, City, State, ZIP Code"
                  className="h-16 resize-none"
                />
                <p className="text-xs text-muted-foreground">Full address shown on your public restaurant page</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Google Maps Link (optional)
                </Label>
                <Input
                  {...form.register("google_maps_url")}
                  placeholder="https://maps.google.com/..."
                />
                <p className="text-xs text-muted-foreground">Paste a Google Maps link so customers can get directions</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency_code" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  Currency
                </Label>
                <select
                  id="currency_code"
                  {...form.register("currency_code")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="INR">🇮🇳 INR - Indian Rupee (₹)</option>
                  <option value="USD">🇺🇸 USD - US Dollar ($)</option>
                  <option value="EUR">🇪🇺 EUR - Euro (€)</option>
                  <option value="GBP">🇬🇧 GBP - British Pound (£)</option>
                  <option value="AUD">🇦🇺 AUD - Australian Dollar (A$)</option>
                  <option value="CAD">🇨🇦 CAD - Canadian Dollar (C$)</option>
                  <option value="SGD">🇸🇬 SGD - Singapore Dollar (S$)</option>
                  <option value="AED">🇦🇪 AED - UAE Dirham (د.إ)</option>
                  <option value="JPY">🇯🇵 JPY - Japanese Yen (¥)</option>
                  <option value="CNY">🇨🇳 CNY - Chinese Yuan (¥)</option>
                </select>
                {form.formState.errors.currency_code && <p className="text-xs text-destructive">{form.formState.errors.currency_code.message}</p>}
                <p className="text-xs text-muted-foreground">All menu prices will be displayed in this currency</p>
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
              <CardDescription>Upload images from your device or paste a URL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Logo Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Logo</Label>
                {w.logo_url ? (
                  <div className="flex items-start gap-4">
                    <div className="relative h-20 w-20 shrink-0 rounded-lg border overflow-hidden bg-muted">
                      <img src={w.logo_url} alt="Logo preview" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={(e) => handleBrandingImageUpload(e, 'logo_url', setUploadingLogo)}
                            disabled={uploadingLogo}
                          />
                          <Button type="button" variant="outline" size="sm" asChild disabled={uploadingLogo}>
                            <span>
                              {uploadingLogo ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                              Replace
                            </span>
                          </Button>
                        </label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue('logo_url', '', { shouldDirty: true })}>
                          <X className="mr-1 h-3.5 w-3.5" /> Remove
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Image uploaded
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleBrandingImageUpload(e, 'logo_url', setUploadingLogo)}
                        disabled={uploadingLogo}
                      />
                      {uploadingLogo ? (
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                      ) : (
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground font-medium">
                        {uploadingLogo ? 'Uploading...' : 'Click to upload logo'}
                      </span>
                      <span className="text-xs text-muted-foreground">PNG, JPEG, WebP or SVG (max 5MB)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">or paste URL</span>
                      <Separator className="flex-1" />
                    </div>
                    <Input {...form.register('logo_url')} placeholder="https://example.com/logo.png" />
                  </div>
                )}
                {form.formState.errors.logo_url && <p className="text-xs text-destructive">{form.formState.errors.logo_url.message}</p>}
              </div>

              <Separator />

              {/* Cover Image Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Cover Image</Label>
                {w.cover_image_url ? (
                  <div className="space-y-2">
                    <div className="relative w-full h-32 rounded-lg border overflow-hidden bg-muted">
                      <img src={w.cover_image_url} alt="Cover preview" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex gap-2">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => handleBrandingImageUpload(e, 'cover_image_url', setUploadingCover)}
                          disabled={uploadingCover}
                        />
                        <Button type="button" variant="outline" size="sm" asChild disabled={uploadingCover}>
                          <span>
                            {uploadingCover ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                            Replace
                          </span>
                        </Button>
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue('cover_image_url', '', { shouldDirty: true })}>
                        <X className="mr-1 h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" /> Image uploaded
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleBrandingImageUpload(e, 'cover_image_url', setUploadingCover)}
                        disabled={uploadingCover}
                      />
                      {uploadingCover ? (
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                      ) : (
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground font-medium">
                        {uploadingCover ? 'Uploading...' : 'Click to upload cover image'}
                      </span>
                      <span className="text-xs text-muted-foreground">PNG, JPEG or WebP (max 5MB)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">or paste URL</span>
                      <Separator className="flex-1" />
                    </div>
                    <Input {...form.register('cover_image_url')} placeholder="https://example.com/cover.jpg" />
                  </div>
                )}
                {form.formState.errors.cover_image_url && <p className="text-xs text-destructive">{form.formState.errors.cover_image_url.message}</p>}
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

          {/* Card 4: Operating Hours */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Operating Hours & Settings
              </CardTitle>
              <CardDescription>
                Set your weekly schedule and holiday mode
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Holiday Mode Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Holiday Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Temporarily close your restaurant
                  </p>
                </div>
                <Switch
                  checked={isHolidayMode}
                  onCheckedChange={setIsHolidayMode}
                />
              </div>

              {isHolidayMode && (
                <div className="space-y-2">
                  <Label>Holiday Message</Label>
                  <Textarea
                    value={holidayMessage}
                    onChange={(e) => setHolidayMessage(e.target.value)}
                    placeholder="e.g., Closed for vacation. We'll be back on Monday!"
                    className="h-20 resize-none"
                  />
                </div>
              )}

              <Separator />

              {/* Operating Hours Editor */}
              <OperatingHoursEditor
                value={operatingHours}
                onChange={setOperatingHours}
                maxVariantsPerItem={maxVariants}
                onMaxVariantsChange={setMaxVariants}
              />
            </CardContent>
          </Card>

          {/* Card 5: Social Media Links */}
          <SocialLinksCard socialLinks={socialLinks} onChange={setSocialLinks} />

          {/* Card 6: Photo Gallery */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                Photo Gallery
              </CardTitle>
              <CardDescription>Upload up to 8 photos of your food, ambiance, etc.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {galleryImages.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                    <img src={url} alt={`Gallery ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setGalleryImages(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {galleryImages.length < 8 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingGallery}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !restaurant?.id) return;
                        if (file.size > 5 * 1024 * 1024) { toast({ title: "File too large", description: "Max 5MB", variant: "destructive" }); return; }
                        setUploadingGallery(true);
                        const ext = file.name.split('.').pop();
                        const path = `gallery-${restaurant.id}-${Date.now()}.${ext}`;
                        const { error: upErr } = await supabase.storage.from('menu-items').upload(path, file);
                        if (upErr) { toast({ title: "Upload failed", variant: "destructive" }); setUploadingGallery(false); return; }
                        const { data: urlData } = supabase.storage.from('menu-items').getPublicUrl(path);
                        setGalleryImages(prev => [...prev, urlData.publicUrl]);
                        setUploadingGallery(false);
                        e.target.value = '';
                      }}
                    />
                    {uploadingGallery ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Plus className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-[10px] text-muted-foreground">Add Photo</span>
                  </label>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 7: Customer Testimonials */}
          <TestimonialsCard testimonials={testimonials} onChange={setTestimonials} />

          {/* Card 8: WhatsApp & Reservations */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                WhatsApp & Reservations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  WhatsApp Number
                </Label>
                <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+91 9876543210" />
                <p className="text-xs text-muted-foreground">A floating WhatsApp button will appear on your public pages</p>
              </div>

              <Separator />

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Table Reservations</Label>
                  <p className="text-sm text-muted-foreground">Allow customers to book tables from your public page</p>
                </div>
                <Switch checked={reservationEnabled} onCheckedChange={setReservationEnabled} />
              </div>

              {reservationEnabled && (
                <div className="space-y-2">
                  <Label>Total Tables</Label>
                  <Input type="number" min={1} max={100} value={totalTables} onChange={e => setTotalTables(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Manage reservations from the Reservations page in the sidebar</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 9: Menu Filters */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Menu Features
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Dietary Filters</Label>
                  <p className="text-sm text-muted-foreground">Show Veg/Non-Veg/Spicy filter buttons on your public menu</p>
                </div>
                <Switch checked={dietaryFiltersEnabled} onCheckedChange={setDietaryFiltersEnabled} />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN: Live Preview & Link */}
        <BrandingPreview
          watched={{
            name: w.name || "",
            slug: w.slug || "",
            description: w.description || "",
            logo_url: w.logo_url || "",
            cover_image_url: w.cover_image_url || "",
            primary_color: w.primary_color || "",
            accent_color: w.accent_color || "",
            contact_email: w.contact_email || "",
            contact_phone: w.contact_phone || "",
          }}
          savedSlug={restaurantData?.slug}
        />
      </div>
    </div>
  );
}