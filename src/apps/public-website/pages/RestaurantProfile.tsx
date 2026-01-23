import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, ArrowRight, Utensils, Mail, AlertCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Helper to safely access settings
function normalizeSettings(settings: any | null) {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
}

// Helper to format operating hours
function formatOperatingHours(operatingHours: any) {
  if (!operatingHours || typeof operatingHours !== 'object') {
    return null;
  }

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels: Record<string, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun'
  };

  const schedule: string[] = [];

  days.forEach(day => {
    const slots = operatingHours[day];
    if (!slots || slots.length === 0) {
      schedule.push(`${dayLabels[day]}: Closed`);
    } else {
      const times = slots.map((slot: any) => `${slot.open}-${slot.close}`).join(', ');
      schedule.push(`${dayLabels[day]}: ${times}`);
    }
  });

  return schedule;
}

export default function RestaurantProfile() {
  const { restaurantSlug } = useParams();
  const slug = (restaurantSlug ?? "").trim();

  // Fetch Restaurant Info
  const { data: restaurant, isLoading, error } = useQuery({
    queryKey: ["public", "restaurant-profile", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  useEffect(() => {
    if (restaurant?.name) document.title = restaurant.name;
  }, [restaurant?.name]);

  if (isLoading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (error || !restaurant) return <div className="h-screen flex items-center justify-center text-red-500">Restaurant not found</div>;

  // Extract Settings
  const settings = normalizeSettings(restaurant.settings);
  const themeColor = settings?.theme?.primary_color || "#0f172a";
  const contactEmail = settings?.contact_email;
  const contactPhone = settings?.contact_phone;

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* --- HERO SECTION --- */}
      <div className="relative h-[55vh] w-full bg-muted overflow-hidden">
        {settings.cover_image_url ? (
          <img src={settings.cover_image_url} alt="Cover" className="h-full w-full object-cover opacity-60" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}

        {/* Overlay Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-6 bg-black/30">

          {/* Logo */}
          <div className="h-28 w-28 md:h-36 md:w-36 rounded-full border-4 border-background bg-background shadow-xl overflow-hidden shrink-0">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground font-bold text-3xl">
                {restaurant.name.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Text */}
          <div className="space-y-2 max-w-2xl text-white drop-shadow-md">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              {restaurant.name}
            </h1>
            <p className="text-lg md:text-xl opacity-90 font-light">
              Experience the best flavors in town.
            </p>
          </div>

          {/* CTA Button */}
          <Button
            size="lg"
            className="rounded-full px-8 h-12 text-base font-bold shadow-lg hover:scale-105 transition-transform"
            style={{ backgroundColor: themeColor, borderColor: themeColor }}
            asChild
          >
            <Link to={`/r/${slug}/menu`}>
              View Menu <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Holiday Mode Banner */}
      {restaurant.is_holiday_mode && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900">Temporarily Closed</h3>
              <p className="text-sm text-amber-800 mt-1">
                {restaurant.holiday_mode_message || "We're currently closed. Please check back later!"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* --- DETAILS SECTION --- */}
      <div className="flex-1 max-w-5xl mx-auto w-full p-6 md:p-12 space-y-12">

        {/* About */}
        <section className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-muted rounded-full mb-2">
            <Utensils className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">About Us</h2>
          <p className="text-muted-foreground leading-relaxed text-lg max-w-2xl mx-auto">
            {restaurant.description || "Welcome to our restaurant. We are dedicated to serving you the freshest ingredients and the most delicious meals. Come dine with us and experience true hospitality."}
          </p>
        </section>

        {/* Info Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Hours */}
          <div className="p-6 bg-card border rounded-2xl flex flex-col items-center text-center gap-3 shadow-sm">
            <Clock className="h-8 w-8 text-primary/60" />
            <h3 className="font-semibold">Opening Hours</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              {(() => {
                const hours = formatOperatingHours(restaurant.operating_hours);
                if (hours && hours.length > 0) {
                  return hours.map((line, idx) => <p key={idx}>{line}</p>);
                }
                return <p>Hours not set</p>;
              })()}
            </div>
          </div>

          {/* Contact */}
          <div className="p-6 bg-card border rounded-2xl flex flex-col items-center text-center gap-3 shadow-sm">
            <Phone className="h-8 w-8 text-primary/60" />
            <h3 className="font-semibold">Contact Us</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              {contactPhone && <p>{contactPhone}</p>}
              {contactEmail && <p>{contactEmail}</p>}
              {!contactPhone && !contactEmail && <p>No contact info available</p>}
            </div>
          </div>

          {/* Location */}
          <div className="p-6 bg-card border rounded-2xl flex flex-col items-center text-center gap-3 shadow-sm">
            <MapPin className="h-8 w-8 text-primary/60" />
            <h3 className="font-semibold">Location</h3>
            <p className="text-sm text-muted-foreground">
              {settings?.address || "Address not available"}
            </p>
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground bg-muted/30">
        &copy; {new Date().getFullYear()} {restaurant.name}. Powered by Project Blueprint.
      </footer>
    </div>
  );
}