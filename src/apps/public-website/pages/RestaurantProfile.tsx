import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, ArrowRight, Utensils, Mail, AlertCircle, Instagram, Facebook, Twitter, Youtube, Star, MessageCircle, CalendarDays, Moon, Sun, ChevronLeft, ChevronRight, X, Tag, Copy, CheckCircle2, Share2, Home, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/formatting";
import { Turnstile } from "@/components/security/Turnstile";

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

/** Returns 'Reopening in X days/hours' from an ISO date string */
function formatCountdown(endDateStr: string): string {
  const diff = new Date(endDateStr).getTime() - Date.now();
  if (diff <= 0) return "Reopening soon";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `Reopening in ${days} day${days > 1 ? 's' : ''}`;
  return `Reopening in ${hours} hour${hours > 1 ? 's' : ''}`;
}

/** Fades + slides in children when they enter the viewport */
function AnimatedSection({ children, className, delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(28px)",
      transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
    }}>{children}</div>
  );
}

export default function RestaurantProfile() {
  const { restaurantSlug } = useParams();
  const { toast } = useToast();
  const slug = (restaurantSlug ?? "").trim();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("dd-dark") === "1");
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("dd-dark", darkMode ? "1" : "0");
  }, [darkMode]);

  // Navbar scroll detection (R1)
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  useSEO({
    title: restaurant ? `${restaurant.name} — Dine Delight` : "Restaurant — Dine Delight",
    description: restaurant?.description || `Order food from ${restaurant?.name || 'this restaurant'} — browse menu, book a table, and more.`,
    ogImage: restaurant?.logo_url || undefined,
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

  // Active Coupons / Offers
  const { data: activeCoupons } = useQuery({
    queryKey: ["public", "coupons", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("coupons")
        .select("id, code, description, discount_type, discount_value, min_order_cents, max_discount_cents, expires_at")
        .eq("restaurant_id", restaurant!.id)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: "Coupon Copied!", description: `Code ${code} copied to clipboard.` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // R6: Real avg rating from orders
  const { data: ratingData } = useQuery({
    queryKey: ["public", "restaurant-rating", restaurant?.id],
    enabled: !!restaurant?.id,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("rating")
        .eq("restaurant_id", restaurant!.id)
        .not("rating", "is", null);
      if (!data || data.length === 0) return null;
      const avg = data.reduce((s, o) => s + (o.rating || 0), 0) / data.length;
      return { avg: Math.round(avg * 10) / 10, count: data.length };
    },
  });

  // R8: Daily specials — items marked as Today's Special by admin
  const { data: specials } = useQuery({
    queryKey: ["public", "daily-specials", restaurant?.id],
    enabled: !!restaurant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, name, description, price_cents, image_url, food_type")
        .eq("restaurant_id", restaurant!.id)
        .eq("is_daily_special", true)
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(6);
      return data || [];
    },
  });

  // Customer Reviews — query approved reviews
  const { data: customerReviews, refetch: refetchReviews } = useQuery({
    queryKey: ["public", "customer-reviews", restaurant?.id],
    enabled: !!restaurant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_reviews")
        .select("id, customer_name, rating, review_text, created_at")
        .eq("restaurant_id", restaurant!.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Review form state
  const [reviewName, setReviewName] = useState("");
  const [reviewPhone, setReviewPhone] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewTurnstileToken, setReviewTurnstileToken] = useState<string | null>(null);

  const submitReview = useCallback(async () => {
    if (!restaurant?.id || !reviewName.trim() || reviewRating < 1) return;
    if (reviewName.trim().length > 100) { toast({ title: "Name too long", description: "Max 100 characters.", variant: "destructive" }); return; }
    if (reviewText.trim().length > 1000) { toast({ title: "Review too long", description: "Max 1000 characters.", variant: "destructive" }); return; }
    setReviewSubmitting(true);
    try {
      const { error } = await supabase.from("customer_reviews").insert({
        restaurant_id: restaurant.id,
        customer_name: reviewName.trim(),
        customer_phone: reviewPhone.trim() || null,
        rating: reviewRating,
        review_text: reviewText.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Review submitted! ⭐", description: "Thank you for your feedback!" });
      setReviewName(""); setReviewPhone(""); setReviewRating(0); setReviewText("");
      refetchReviews();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Could not submit review.", variant: "destructive" });
    } finally {
      setReviewSubmitting(false);
    }
  }, [restaurant?.id, reviewName, reviewPhone, reviewRating, reviewText, toast, refetchReviews]);

  // Computed avg from customer reviews
  const customerAvgRating = useMemo(() => {
    if (!customerReviews || customerReviews.length === 0) return null;
    const sum = customerReviews.reduce((s, r) => s + r.rating, 0);
    return { avg: Math.round((sum / customerReviews.length) * 10) / 10, count: customerReviews.length };
  }, [customerReviews]);

  // R7: Share handler
  const handleShare = useCallback(async () => {
    const shareData = { title: restaurant?.name || "Restaurant", text: restaurant?.description || `Check out ${restaurant?.name}!`, url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link Copied!", description: "Restaurant link copied to clipboard." });
    }
  }, [restaurant, toast]);

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

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">

      {/* R1: Sticky Navbar — transparent at top, solid on scroll */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-background/95 backdrop-blur-lg border-b shadow-sm" : "bg-transparent"
      }`}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to={`/r/${slug}`}
            className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${
              isScrolled ? "text-foreground" : "text-white drop-shadow"
            }`}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">{restaurant.name}</span>
          </Link>
          <span className={`hidden sm:block text-sm font-bold truncate max-w-[200px] transition-opacity duration-300 ${
            isScrolled ? "opacity-100" : "opacity-0"
          }`}>{restaurant.name}</span>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`h-9 w-9 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
              isScrolled ? "bg-muted border shadow-sm" : "bg-black/20 backdrop-blur-sm"
            }`}
            aria-label="Toggle dark mode"
          >
            {darkMode
              ? <Sun className="h-4 w-4 text-amber-400" />
              : <Moon className={`h-4 w-4 ${isScrolled ? "" : "text-white"}`} />}
          </button>
        </div>
      </header>

      {/* HERO */}
      <div className="relative h-[60vh] w-full bg-muted overflow-hidden">
        {settings.cover_image_url ? (
          <img src={settings.cover_image_url} alt="Cover" className="h-full w-full object-cover opacity-60" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-3 bg-black/35 pt-14">
          <div className="h-28 w-28 md:h-32 md:w-32 rounded-full border-4 border-background bg-background shadow-xl overflow-hidden shrink-0">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground font-bold text-3xl">{restaurant.name.substring(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="space-y-1.5 max-w-2xl text-white drop-shadow-md">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{restaurant.name}</h1>
            {/* R6: Real avg rating */}
            {ratingData && (
              <div className="flex items-center justify-center gap-1.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`h-4 w-4 ${
                    s <= Math.round(ratingData.avg) ? 'fill-amber-400 text-amber-400' : 'text-white/30'
                  }`} />
                ))}
                <span className="text-sm font-semibold ml-1">{ratingData.avg}</span>
                <span className="text-xs text-white/70">({ratingData.count} reviews)</span>
              </div>
            )}
            {/* Cuisine Badges */}
            {Array.isArray((settings as any)?.cuisine_types) && (settings as any).cuisine_types.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {(settings as any).cuisine_types.map((c: string) => (
                  <Badge key={c} variant="secondary" className="bg-white/20 text-white border-white/30 text-xs backdrop-blur-sm">{c}</Badge>
                ))}
              </div>
            )}
            <p className="text-base sm:text-lg opacity-90 font-light">{restaurant.description || "Welcome to our restaurant — explore our menu and order online."}</p>
          </div>
          {/* Open/Closed Badge */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            openStatus.open ? 'bg-green-500/90 text-white' : 'bg-red-500/80 text-white'
          }`}>
            <span className={`h-2 w-2 rounded-full ${openStatus.open ? 'bg-white animate-pulse' : 'bg-white/60'}`} />
            {openStatus.label}
          </div>
          <Button size="lg" className="rounded-full px-8 h-12 text-base font-bold shadow-lg hover:scale-105 transition-transform" style={{ backgroundColor: themeColor, borderColor: themeColor }} asChild>
            <Link to={`/r/${slug}/menu`}>View Menu <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
        </div>
      </div>

      {/* R12: Improved Holiday Banner with countdown */}
      {restaurant.is_holiday_mode && (() => {
        const endDateStr = (settings as any)?.holiday_mode_end_date as string | undefined;
        const countdown = endDateStr ? formatCountdown(endDateStr) : null;
        return (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-400">
            <div className="max-w-5xl mx-auto p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  Temporarily Closed
                  {countdown && <span className="text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded-full">{countdown}</span>}
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                  {restaurant.holiday_mode_message || "We're currently closed. Please check back later!"}
                </p>
                {endDateStr && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Expected reopening: {new Date(endDateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* DETAILS */}
      <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-12 space-y-12">

        {/* About — R10: animated entrance */}
        <AnimatedSection>
          <section className="space-y-4 text-center">
            <div className="inline-flex items-center justify-center p-3 bg-muted rounded-full mb-2"><Utensils className="h-6 w-6 text-muted-foreground" /></div>
            <h2 className="text-3xl font-bold tracking-tight">About Us</h2>
            <p className="text-muted-foreground leading-relaxed text-lg max-w-2xl mx-auto">{restaurant.description || "Welcome to our restaurant."}</p>
          </section>
        </AnimatedSection>

        {/* R8: Today's Specials — from DB (admin-marked items) */}
        {specials && specials.length > 0 && (
          <AnimatedSection delay={50}>
            <section className="space-y-4">
              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white mb-3" style={{ backgroundColor: themeColor }}>
                  <Zap className="h-3.5 w-3.5" /> Today's Specials
                </span>
                <h2 className="text-2xl font-bold tracking-tight mt-2">Chef's Pick of the Day</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {specials.map((sp: any) => (
                  <div key={sp.id} className="flex gap-3 p-4 rounded-2xl border bg-gradient-to-br from-card to-muted/30 shadow-sm hover:shadow-md transition-shadow">
                    {sp.image_url ? (
                      <img src={sp.image_url} alt={sp.name} className="h-16 w-16 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center shrink-0 text-2xl">
                        {sp.food_type === 'nonveg' ? '🍗' : sp.food_type === 'egg' ? '🥚' : '🥗'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${
                          sp.food_type === 'nonveg' ? 'bg-red-500' : sp.food_type === 'egg' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                        <h4 className="font-bold truncate">{sp.name}</h4>
                      </div>
                      {sp.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{sp.description}</p>}
                      <p className="text-sm font-bold mt-1" style={{ color: themeColor }}>{formatMoney(sp.price_cents, currencyCode)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </AnimatedSection>
        )}

        {/* Exciting Offers — R10 animated */}
        {activeCoupons && activeCoupons.length > 0 && (
          <AnimatedSection delay={100}>
            <section className="space-y-4">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: themeColor }}>Special Offers</p>
              <h2 className="text-2xl font-bold tracking-tight">Exciting Offers for You</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeCoupons.map((coupon: any) => (
                <div key={coupon.id} className="relative rounded-2xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                  <div className="p-5 space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: themeColor }}>
                      <Tag className="h-3 w-3" />
                      {coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : `₹${coupon.discount_value / 100} OFF`}
                    </div>
                    <h4 className="font-semibold">{coupon.description || `Special Discount`}</h4>
                    {coupon.min_order_cents > 0 && (
                      <p className="text-xs text-muted-foreground">On orders above {formatMoney(coupon.min_order_cents, currencyCode)}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted rounded-md px-3 py-1.5 text-sm font-mono font-bold tracking-wider">{coupon.code}</code>
                      <button
                        onClick={() => handleCopyCode(coupon.code)}
                        className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        {copiedCode === coupon.code ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                    {coupon.expires_at && (
                      <p className="text-[11px] text-muted-foreground">Valid till {new Date(coupon.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          </AnimatedSection>
        )}

        {/* Photo Gallery — R10 animated */}
        {galleryImages.length > 0 && (
          <AnimatedSection delay={80}>
            <section className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-center">Gallery</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {galleryImages.map((url, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setLightboxImg(url)}>
                    <img src={url} alt={`Gallery ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </section>
          </AnimatedSection>
        )}

        {/* Featured Menu Items — R10 animated */}
        {featuredItems && featuredItems.length > 0 && (
          <AnimatedSection delay={60}>
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
          </AnimatedSection>
        )}

        {/* Chef's Story — R10 animated */}
        {(settings as any)?.chefs_story && (
          <AnimatedSection>
            <section className="space-y-4 text-center">
              <h2 className="text-2xl font-bold tracking-tight">Our Story</h2>
              <p className="text-muted-foreground leading-relaxed text-base max-w-2xl mx-auto">{(settings as any).chefs_story}</p>
            </section>
          </AnimatedSection>
        )}

        {/* Events & Special Nights — R10 animated */}
        {Array.isArray((settings as any)?.events) && (settings as any).events.length > 0 && (
          <AnimatedSection delay={40}>
            <section className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-center">Events & Special Nights</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(settings as any).events.map((evt: any, i: number) => (
                  <div key={i} className="rounded-xl border bg-card p-5 space-y-2 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><CalendarDays className="h-6 w-6 text-primary" /></div>
                      <div>
                        <h3 className="font-semibold">{evt.name}</h3>
                        {evt.date && <p className="text-xs text-muted-foreground">{evt.date}</p>}
                      </div>
                    </div>
                    {evt.description && <p className="text-sm text-muted-foreground">{evt.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          </AnimatedSection>
        )}

        {/* Info Grid — R10 animated */}
        <AnimatedSection delay={30}>
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
        </AnimatedSection>


        {/* Testimonials — R10 animated */}
        {testimonials.length > 0 && (
          <AnimatedSection delay={50}>
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
          </AnimatedSection>
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

      {/* ───── Customer Reviews & Ratings ───── */}
      <AnimatedSection className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Customer Reviews</h2>
          {(customerAvgRating || ratingData) && (
            <div className="mt-2 flex items-center justify-center gap-3">
              {customerAvgRating && (
                <div className="flex items-center gap-1.5">
                  <div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-5 w-5 ${i < Math.round(customerAvgRating.avg) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />)}</div>
                  <span className="font-semibold text-lg">{customerAvgRating.avg}</span>
                  <span className="text-sm text-muted-foreground">({customerAvgRating.count} reviews)</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Review Cards */}
        {customerReviews && customerReviews.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
            {customerReviews.slice(0, 9).map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{r.customer_name}</p>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />)}</div>
                {r.review_text && <p className="text-sm text-muted-foreground">{r.review_text}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Submit Review Form */}
        <div className="max-w-lg mx-auto rounded-xl border bg-card p-6 space-y-4">
          <h3 className="font-semibold text-lg text-center">Leave a Review</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rev-name" className="text-xs">Your Name *</Label>
              <Input id="rev-name" placeholder="Your name" maxLength={100} value={reviewName} onChange={e => setReviewName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rev-phone" className="text-xs">Phone (optional)</Label>
              <Input id="rev-phone" type="tel" placeholder="Phone number" value={reviewPhone} onChange={e => setReviewPhone(e.target.value)} />
            </div>
          </div>
          {/* Star picker */}
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} type="button" className="p-0.5" onClick={() => setReviewRating(i + 1)} onMouseEnter={() => setReviewHover(i + 1)} onMouseLeave={() => setReviewHover(0)}>
                <Star className={`h-7 w-7 transition-colors ${(reviewHover || reviewRating) > i ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
              </button>
            ))}
          </div>
          <textarea
            placeholder="Write your review (optional)..."
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            maxLength={1000}
          />
          <div className="flex justify-center">
            <Turnstile onVerify={setReviewTurnstileToken} />
          </div>
          <Button className="w-full" disabled={!reviewName.trim() || reviewRating < 1 || reviewSubmitting || !reviewTurnstileToken} onClick={submitReview}>
            {reviewSubmitting ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </AnimatedSection>

      {/* Schema.org Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Restaurant",
        "name": restaurant.name,
        "description": restaurant.description || "",
        "image": restaurant.logo_url || "",
        "url": window.location.href,
        ...(settings?.address ? { "address": { "@type": "PostalAddress", "streetAddress": settings.address } } : {}),
        ...(contactPhone ? { "telephone": contactPhone } : {}),
        ...(contactEmail ? { "email": contactEmail } : {}),
        "servesCuisine": Array.isArray((settings as any)?.cuisine_types) ? (settings as any).cuisine_types : [],
      }) }} />

      {/* Gallery Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxImg(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 z-10" onClick={() => setLightboxImg(null)}><X className="h-8 w-8" /></button>
          <img src={lightboxImg} alt="Gallery" className="max-h-[85vh] max-w-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

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
          <div className="flex items-center gap-2 shrink-0">
            {/* R7: Share button */}
            <Button size="sm" variant="ghost" className="rounded-full px-3" onClick={handleShare} title="Share">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Share</span>
            </Button>
            {reservationEnabled && (
              <Button size="sm" variant="outline" className="rounded-full px-4 font-bold" asChild>
                <Link to={`/r/${slug}/reserve`}><CalendarDays className="mr-1 h-4 w-4" />Book Table</Link>
              </Button>
            )}
            <Button size="sm" className="rounded-full px-6 font-bold" style={{ backgroundColor: themeColor }} asChild>
              <Link to={`/r/${slug}/menu`}>Order Now <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}