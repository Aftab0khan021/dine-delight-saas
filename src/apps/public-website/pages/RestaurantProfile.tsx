import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, ArrowRight, Utensils, Mail, AlertCircle, Instagram, Facebook, Twitter, Youtube, Star, MessageCircle, CalendarDays, Moon, Sun, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/formatting";

function normalizeSettings(settings: any | null) {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
}

function formatOperatingHours(operatingHours: any) {
  if (!operatingHours || typeof operatingHours !== 'object') return null;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels: Record<string, string> = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const schedule: string[] = [];
  days.forEach(day => {
    const slots = operatingHours[day];
    if (!slots || slots.length === 0) { schedule.push(`${dayLabels[day]}: Closed`); }
    else { const times = slots.map((slot: any) => `${slot.open}-${slot.close}`).join(', '); schedule.push(`${dayLabels[day]}: ${times}`); }
  });
  return schedule;
}

function isOpenNow(operatingHours: any): { open: boolean; label: string } {
  if (!operatingHours || typeof operatingHours !== 'object') return { open: false, label: "Hours not set" };
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];
  const slots = operatingHours[today];
  if (!slots || slots.length === 0) return { open: false, label: "Closed Today" };
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const slot of slots) {
    if (currentTime >= slot.open && currentTime <= slot.close) return { open: true, label: "Open Now" };
  }
  return { open: false, label: "Closed Now" };
}

export default function RestaurantProfile() {
  const { restaurantSlug } = useParams();
  const { toast } = useToast();
  const slug = (restaurantSlug ?? "").trim();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("dd-dark") === "1");
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [reviewIdx, setReviewIdx] = useState(0);

  // Reservation form
  const [resName, setResName] = useState("");
  const [resPhone, setResPhone] = useState("");
  const [resDate, setResDate] = useState("");
  const [resTime, setResTime] = useState("");
  const [resParty, setResParty] = useState(2);
  const [resSubmitting, setResSubmitting] = useState(false);
  const [resSuccess, setResSuccess] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("dd-dark", darkMode ? "1" : "0");
  }, [darkMode]);

  const { data: restaurant, isLoading, error } = useQuery({
    queryKey: ["public", "restaurant-profile", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name, slug, logo_url, description, settings, is_holiday_mode, holiday_mode_message, operating_hours, currency_code").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  // Featured menu items
  const { data: featuredItems } = useQuery({
    queryKey: ["public", "featured-items", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("id, name, price_cents, image_url, description").eq("restaurant_id", restaurant!.id).eq("is_active", true).is("deleted_at", null).limit(4);
      return data || [];
    },
  });

  useEffect(() => {
    if (restaurant?.name) {
      document.title = `${restaurant.name} | Dine Delight`;
      // SEO meta tags
      const desc = restaurant.description || `Order online from ${restaurant.name}`;
      document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
      let ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", restaurant.name);
      let ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", desc);
    }
  }, [restaurant]);

  if (isLoading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (error || !restaurant) return <div className="h-screen flex items-center justify-center text-red-500">Restaurant not found</div>;

  const settings = normalizeSettings(restaurant.settings);
  const themeColor = settings?.theme?.primary_color || "#0f172a";
  const contactEmail = settings?.contact_email;
  const contactPhone = settings?.contact_phone;
  const socialLinks = settings?.social_links || {};
  const galleryImages: string[] = Array.isArray(settings?.gallery_images) ? settings.gallery_images : [];
  const testimonials: { name: string; text: string; rating: number }[] = Array.isArray(settings?.testimonials) ? settings.testimonials : [];
  const whatsappNumber = settings?.whatsapp_number;
  const reservationEnabled = !!settings?.reservation_enabled;
  const openStatus = isOpenNow(restaurant.operating_hours);
  const hasSocial = Object.values(socialLinks).some((v: any) => !!v);
  const currencyCode = restaurant?.currency_code || "INR";

  const handleReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resName || !resPhone || !resDate || !resTime) { toast({ title: "Fill all fields", variant: "destructive" }); return; }
    setResSubmitting(true);
    const { error } = await supabase.from("reservations").insert({ restaurant_id: restaurant.id, customer_name: resName, customer_phone: resPhone, party_size: resParty, reservation_date: resDate, reservation_time: resTime, status: "pending" });
    setResSubmitting(false);
    if (error) { toast({ title: "Failed to book", description: error.message, variant: "destructive" }); return; }
    setResSuccess(true);
    toast({ title: "Reservation Submitted!", description: "The restaurant will confirm your booking." });
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">

      {/* Dark mode toggle */}
      <button onClick={() => setDarkMode(!darkMode)} className="fixed top-4 right-4 z-50 h-10 w-10 rounded-full bg-card border shadow-lg flex items-center justify-center hover:scale-110 transition-transform" aria-label="Toggle dark mode">
        {darkMode ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* HERO */}
      <div className="relative h-[55vh] w-full bg-muted overflow-hidden">
        {settings.cover_image_url ? (
          <img src={settings.cover_image_url} alt="Cover" className="h-full w-full object-cover opacity-60" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-4 bg-black/30">
          <div className="h-28 w-28 md:h-36 md:w-36 rounded-full border-4 border-background bg-background shadow-xl overflow-hidden shrink-0">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground font-bold text-3xl">{restaurant.name.substring(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="space-y-2 max-w-2xl text-white drop-shadow-md">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{restaurant.name}</h1>
            <p className="text-base sm:text-lg md:text-xl opacity-90 font-light">{restaurant.description || "Welcome to our restaurant — explore our menu and order online."}</p>
          </div>
          {/* Open/Closed Badge */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${openStatus.open ? 'bg-green-500/90 text-white' : 'bg-red-500/80 text-white'}`}>
            <span className={`h-2 w-2 rounded-full ${openStatus.open ? 'bg-white animate-pulse' : 'bg-white/60'}`} />
            {openStatus.label}
          </div>
          <Button size="lg" className="rounded-full px-8 h-12 text-base font-bold shadow-lg hover:scale-105 transition-transform" style={{ backgroundColor: themeColor, borderColor: themeColor }} asChild>
            <Link to={`/r/${slug}/menu`}>View Menu <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
        </div>
      </div>

      {/* Holiday Banner */}
      {restaurant.is_holiday_mode && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 p-4">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-200">Temporarily Closed</h3>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">{restaurant.holiday_mode_message || "We're currently closed. Please check back later!"}</p>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS */}
      <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-12 space-y-12">

        {/* About */}
        <section className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-muted rounded-full mb-2"><Utensils className="h-6 w-6 text-muted-foreground" /></div>
          <h2 className="text-3xl font-bold tracking-tight">About Us</h2>
          <p className="text-muted-foreground leading-relaxed text-lg max-w-2xl mx-auto">{restaurant.description || "Welcome to our restaurant."}</p>
        </section>

        {/* Photo Gallery */}
        {galleryImages.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-center">Gallery</h2>
            <div className="relative">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {galleryImages.map((url, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                    <img src={url} alt={`Gallery ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Featured Menu Items */}
        {featuredItems && featuredItems.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-center">Popular Items</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredItems.map((item: any) => (
                <Link key={item.id} to={`/r/${slug}/menu`} className="group">
                  <div className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="aspect-square bg-muted overflow-hidden">
                      {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" /> : <div className="h-full w-full flex items-center justify-center"><Utensils className="h-8 w-8 text-muted-foreground/30" /></div>}
                    </div>
                    <div className="p-3">
                      <h4 className="font-semibold text-sm line-clamp-1">{item.name}</h4>
                      <p className="text-xs text-primary font-bold mt-1">{formatMoney(item.price_cents, currencyCode)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-card border rounded-2xl flex flex-col items-center text-center gap-3 shadow-sm">
            <Clock className="h-8 w-8 text-primary/60" />
            <h3 className="font-semibold">Opening Hours</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              {(() => { const hours = formatOperatingHours(restaurant.operating_hours); if (hours && hours.length > 0) return hours.map((line, idx) => <p key={idx}>{line}</p>); return <p>Hours not set</p>; })()}
            </div>
          </div>
          <div className="p-6 bg-card border rounded-2xl flex flex-col items-center text-center gap-3 shadow-sm">
            <Phone className="h-8 w-8 text-primary/60" />
            <h3 className="font-semibold">Contact Us</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              {contactPhone && <p>{contactPhone}</p>}
              {contactEmail && <p>{contactEmail}</p>}
              {!contactPhone && !contactEmail && <p>No contact info available</p>}
            </div>
          </div>
          {settings?.address && (
            <div className="p-6 bg-card border rounded-2xl flex flex-col items-center text-center gap-3 shadow-sm">
              <MapPin className="h-8 w-8 text-primary/60" />
              <h3 className="font-semibold">Location</h3>
              <p className="text-sm text-muted-foreground">{settings.address}</p>
              {settings?.google_maps_url && <a href={settings.google_maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-1"><MapPin className="h-3.5 w-3.5" />Get Directions</a>}
            </div>
          )}
        </div>

        {/* Testimonials */}
        {testimonials.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-center">What Our Customers Say</h2>
            <div className="relative max-w-2xl mx-auto">
              <div className="bg-card border rounded-2xl p-6 text-center shadow-sm min-h-[160px] flex flex-col items-center justify-center">
                <div className="flex gap-0.5 mb-3">
                  {[1, 2, 3, 4, 5].map(s => <Star key={s} className={`h-5 w-5 ${s <= testimonials[reviewIdx]?.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />)}
                </div>
                <p className="text-muted-foreground italic leading-relaxed">"{testimonials[reviewIdx]?.text}"</p>
                <p className="font-semibold mt-3 text-sm">— {testimonials[reviewIdx]?.name}</p>
              </div>
              {testimonials.length > 1 && (
                <div className="flex justify-center gap-2 mt-3">
                  <button onClick={() => setReviewIdx(i => (i - 1 + testimonials.length) % testimonials.length)} className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="flex items-center text-xs text-muted-foreground">{reviewIdx + 1} / {testimonials.length}</span>
                  <button onClick={() => setReviewIdx(i => (i + 1) % testimonials.length)} className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Reservation Form */}
        {reservationEnabled && !resSuccess && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-center">Reserve a Table</h2>
            <form onSubmit={handleReservation} className="max-w-lg mx-auto bg-card border rounded-2xl p-6 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Name *</Label><Input value={resName} onChange={e => setResName(e.target.value)} placeholder="Your name" required /></div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Phone *</Label><Input value={resPhone} onChange={e => setResPhone(e.target.value)} placeholder="+91 ..." required /></div>
                <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={resDate} onChange={e => setResDate(e.target.value)} min={new Date().toISOString().split('T')[0]} required /></div>
                <div className="space-y-1.5"><Label>Time *</Label><Input type="time" value={resTime} onChange={e => setResTime(e.target.value)} required /></div>
                <div className="space-y-1.5 col-span-2"><Label>Party Size</Label><Input type="number" min={1} max={20} value={resParty} onChange={e => setResParty(Number(e.target.value))} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={resSubmitting} style={{ backgroundColor: themeColor }}>
                {resSubmitting ? "Booking..." : <><CalendarDays className="mr-2 h-4 w-4" />Book Table</>}
              </Button>
            </form>
          </section>
        )}
        {resSuccess && (
          <section className="text-center space-y-2 p-6 bg-green-50 dark:bg-green-950/20 rounded-2xl border border-green-200 dark:border-green-800">
            <CalendarDays className="h-10 w-10 text-green-600 mx-auto" />
            <h3 className="text-xl font-bold text-green-800 dark:text-green-300">Reservation Submitted!</h3>
            <p className="text-sm text-green-700 dark:text-green-400">The restaurant will confirm your booking soon.</p>
          </section>
        )}

        {/* Social Links */}
        {hasSocial && (
          <section className="flex justify-center gap-3">
            {socialLinks.instagram && <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"><Instagram className="h-5 w-5" /></a>}
            {socialLinks.facebook && <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"><Facebook className="h-5 w-5" /></a>}
            {socialLinks.twitter && <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"><Twitter className="h-5 w-5" /></a>}
            {socialLinks.youtube && <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"><Youtube className="h-5 w-5" /></a>}
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground bg-muted/30">
        &copy; {new Date().getFullYear()} {restaurant.name}. Powered by Dine Delight.
      </footer>

      {/* WhatsApp Floating Button */}
      {whatsappNumber && (
        <a href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi! I'd like to know more about ${restaurant.name}`)}`} target="_blank" rel="noopener noreferrer" className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full bg-green-500 text-white shadow-lg flex items-center justify-center hover:bg-green-600 hover:scale-110 transition-all" aria-label="Chat on WhatsApp">
          <MessageCircle className="h-7 w-7" />
        </a>
      )}

      {/* Sticky Order Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur border-t shadow-lg p-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {restaurant.logo_url && <img src={restaurant.logo_url} alt="" className="h-8 w-8 rounded-full border shrink-0" />}
            <span className="font-semibold text-sm truncate">{restaurant.name}</span>
            <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${openStatus.open ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${openStatus.open ? 'bg-green-500' : 'bg-red-500'}`} />{openStatus.label}
            </span>
          </div>
          <Button size="sm" className="rounded-full px-6 font-bold shrink-0" style={{ backgroundColor: themeColor }} asChild>
            <Link to={`/r/${slug}/menu`}>Order Now <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}