import { useEffect, useMemo, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Image as ImageIcon, Palette, Save, Store, X, Phone, Mail, Clock, DollarSign, Upload, Loader2, MapPin, Instagram, Facebook, Twitter, Youtube, MessageCircle, Star, Plus, Trash2, CalendarDays, Filter, Users } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { OperatingHoursEditor } from "../components/branding/OperatingHoursEditor";

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

const formSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required").max(120),
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
  const [testimonials, setTestimonials] = useState<{ name: string; text: string; rating: number }[]>([]);
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

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: async (values: BrandingFormValues) => {
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
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Instagram className="h-4 w-4 text-muted-foreground" />
                Social Media Links
              </CardTitle>
              <CardDescription>Add your social media profiles. They'll appear on your public page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Instagram className="h-3.5 w-3.5" /> Instagram</Label>
                  <Input value={socialLinks.instagram} onChange={e => setSocialLinks(p => ({ ...p, instagram: e.target.value }))} placeholder="https://instagram.com/..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Facebook className="h-3.5 w-3.5" /> Facebook</Label>
                  <Input value={socialLinks.facebook} onChange={e => setSocialLinks(p => ({ ...p, facebook: e.target.value }))} placeholder="https://facebook.com/..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Twitter className="h-3.5 w-3.5" /> Twitter / X</Label>
                  <Input value={socialLinks.twitter} onChange={e => setSocialLinks(p => ({ ...p, twitter: e.target.value }))} placeholder="https://x.com/..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Youtube className="h-3.5 w-3.5" /> YouTube</Label>
                  <Input value={socialLinks.youtube} onChange={e => setSocialLinks(p => ({ ...p, youtube: e.target.value }))} placeholder="https://youtube.com/..." />
                </div>
              </div>
            </CardContent>
          </Card>

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
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                Customer Testimonials
              </CardTitle>
              <CardDescription>Add up to 5 customer reviews to display on your public page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {testimonials.map((t, i) => (
                <div key={i} className="flex gap-2 items-start p-3 rounded-lg border bg-muted/20">
                  <div className="flex-1 space-y-2">
                    <Input value={t.name} placeholder="Customer name" onChange={e => setTestimonials(prev => prev.map((item, idx) => idx === i ? { ...item, name: e.target.value } : item))} />
                    <Textarea value={t.text} placeholder="What did they say?" className="h-16 resize-none" onChange={e => setTestimonials(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} />
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button key={s} type="button" onClick={() => setTestimonials(prev => prev.map((item, idx) => idx === i ? { ...item, rating: s } : item))}>
                          <Star className={`h-4 w-4 ${s <= t.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setTestimonials(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {testimonials.length < 5 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setTestimonials(prev => [...prev, { name: "", text: "", rating: 5 }])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Testimonial
                </Button>
              )}
            </CardContent>
          </Card>

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
          <Card className="shadow-sm overflow-hidden lg:sticky lg:top-6">
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