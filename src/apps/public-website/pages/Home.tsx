import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Utensils, ClipboardList, BarChart3, QrCode, Users, CreditCard,
  MessageCircle, Tag, Package, Split, ChevronRight, Check, X,
  Star, Menu as MenuIcon, ArrowRight,
} from "lucide-react";
import { formatMoney } from "@/lib/formatting";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: Utensils,      title: "Menu Management",      desc: "Categories, variants, add-ons, food type tags, allergens & spice levels" },
  { icon: ClipboardList, title: "Order Tracking",        desc: "Real-time Kanban board with sound alerts & kitchen display" },
  { icon: BarChart3,     title: "Analytics Dashboard",   desc: "Revenue trends, top items, menu insights & performance metrics" },
  { icon: QrCode,        title: "QR Code Ordering",      desc: "Table-specific QR menus for contactless dine-in ordering" },
  { icon: Users,         title: "Staff Management",      desc: "Custom roles, permissions, categories & invitation flow" },
  { icon: CreditCard,    title: "Online Payments",       desc: "Razorpay integration — UPI, cards, net banking & wallets" },
  { icon: MessageCircle, title: "WhatsApp CRM",          desc: "Order notifications, receipts & re-engagement campaigns" },
  { icon: Tag,           title: "Coupons & Discounts",   desc: "Flexible promo codes with usage limits & validity periods" },
  { icon: Package,       title: "Inventory Tracking",    desc: "Stock management with auto-disable when items run out" },
  { icon: Split,         title: "Split Bill",            desc: "Collaborative cart & group ordering for dine-in tables" },
];

const TESTIMONIALS = [
  { quote: "Dine Delight reduced our order errors by 80%. The QR ordering is a game changer for our busy evenings!", name: "Rahul Sharma", restaurant: "Spice Garden" },
  { quote: "We saved ₹30,000/month by ditching Swiggy commissions. Now we own our customers and data.", name: "Priya Patel", restaurant: "The Green Bowl" },
  { quote: "Setting up took 15 minutes. Our staff learned it in a day. Best investment for our restaurant.", name: "Amit Desai", restaurant: "Coastal Bites" },
];

const FAQS = [
  { q: "How much does Dine Delight cost?", a: "We offer a free plan to get started with up to 50 menu items. Our Pro plan unlocks unlimited items, staff accounts, and advanced features. Check the pricing section above for details." },
  { q: "Do I need technical knowledge to set it up?", a: "Not at all! Our platform is designed for restaurant owners — no coding needed. Sign up, add your menu, print QR codes, and you're live in under 30 minutes." },
  { q: "How do online payments work?", a: "We integrate with Razorpay for secure payments. Your customers can pay via UPI, credit/debit cards, net banking, and wallets. Money goes directly to your account — we never hold your funds." },
  { q: "Can I customize my restaurant's public page?", a: "Yes! You can set your brand colors, upload a logo, add a gallery, testimonials, operating hours, and even enable/disable features like reservations and dietary filters." },
  { q: "Is my data secure?", a: "Absolutely. We use Supabase (built on PostgreSQL) with row-level security, encrypted connections, and Cloudflare protection. Your data is yours — we never share it." },
  { q: "Can I use it for multiple restaurants?", a: "Currently each restaurant gets its own account. Multi-outlet management from a single dashboard is on our roadmap and coming soon." },
];

/* Feature key → Human-readable label (for pricing cards) */
const FEATURE_LABELS: Record<string, string> = {
  online_ordering: "Online Ordering",
  qr_menu: "QR Code Menu",
  table_ordering: "Table Ordering",
  analytics: "Analytics Dashboard",
  multi_language: "Multi-Language",
  kitchen_display: "Kitchen Display",
  coupons: "Coupons & Discounts",
  reviews: "Customer Reviews",
  customer_management: "Customer CRM",
  delivery_zones: "Delivery Zones",
  table_reservations: "Table Reservations",
  inventory_management: "Inventory Tracking",
  loyalty_program: "Loyalty Program",
  email_marketing: "Email Marketing",
  multi_location: "Multi-Location",
  custom_domain: "Custom Domain",
  api_access: "API Access",
  priority_support: "Priority Support",
  white_label: "White Label",
  menu_insights: "Menu Insights (AI)",
  whatsapp_crm: "WhatsApp CRM",
  whatsapp_bot: "WhatsApp Bot",
  otp_verification: "OTP Verification",
  staff_limit: "Staff Limit",
  menu_items_limit: "Menu Items Limit",
  api_rate_limit: "API Rate Limit",
};

/* ------------------------------------------------------------------ */
/*  HOOKS                                                              */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, duration = 2000, trigger = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(id); }
      else setValue(start);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration, trigger]);
  return value;
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [isYearly, setIsYearly] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState<Record<string, boolean>>({});
  const statsRef = useRef<HTMLDivElement>(null);

  useSEO({
    title: "Dine Delight — Restaurant Management Platform | Zero Commission",
    description: "Complete restaurant management platform with menu management, QR ordering, online payments, analytics & more. Zero commission. Full control.",
  });

  // — Dynamic stats from DB —
  const { data: stats } = useQuery({
    queryKey: ["landing", "stats"],
    queryFn: async () => {
      const [r, o, rev] = await Promise.all([
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("total_cents"),
      ]);
      const totalRevenue = (rev.data || []).reduce((s: number, o: any) => s + (o.total_cents || 0), 0);
      return { restaurants: r.count || 0, orders: o.count || 0, revenue: totalRevenue };
    },
    staleTime: 60_000,
  });

  // — Pricing from DB —
  const { data: plans } = useQuery({
    queryKey: ["landing", "plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return data || [];
    },
    staleTime: 300_000,
  });

  // Stats intersection observer
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Auto-rotate testimonials
  useEffect(() => {
    const id = setInterval(() => setActiveTestimonial(p => (p + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(id);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const restaurantCount = useCountUp(stats?.restaurants || 0, 1500, statsVisible);
  const orderCount = useCountUp(stats?.orders || 0, 1500, statsVisible);
  const revenueCount = useCountUp(Math.round((stats?.revenue || 0) / 100), 1500, statsVisible);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">

      {/* ═══════════════ SECTION 1: STICKY NAV ═══════════════ */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => scrollTo("hero")} className="flex items-center gap-2 text-lg font-bold tracking-tight">
            🍽️ <span>Dine Delight</span>
          </button>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <button onClick={() => scrollTo("features")} className="hover:text-foreground transition-colors">Features</button>
            <button onClick={() => scrollTo("pricing")} className="hover:text-foreground transition-colors">Pricing</button>
            <button onClick={() => scrollTo("faq")} className="hover:text-foreground transition-colors">FAQ</button>
            <Link to="/admin/auth"><Button size="sm">Get Started</Button></Link>
          </nav>
          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-2">
            <button onClick={() => scrollTo("features")} className="block w-full text-left text-sm py-1.5">Features</button>
            <button onClick={() => scrollTo("pricing")} className="block w-full text-left text-sm py-1.5">Pricing</button>
            <button onClick={() => scrollTo("faq")} className="block w-full text-left text-sm py-1.5">FAQ</button>
            <Link to="/admin/auth" className="block"><Button size="sm" className="w-full mt-1">Get Started</Button></Link>
          </div>
        )}
      </header>

      <main className="flex-1">

        {/* ═══════════════ SECTION 2: HERO ═══════════════ */}
        <section id="hero" className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>
          <div className="absolute inset-0 opacity-10">
            {["🍕","🍔","🍣","🥗","☕","🍰"].map((e, i) => (
              <span key={i} className="absolute text-4xl select-none" style={{
                top: `${15 + i * 14}%`, left: `${5 + i * 16}%`,
                animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
              }}>{e}</span>
            ))}
          </div>
          <div className="container mx-auto px-4 py-20 md:py-32 text-center relative z-10">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white mb-6 leading-tight" style={{ animation: "fadeInUp 0.8s ease-out" }}>
              Your Restaurant,<br />
              <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Your Rules.</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto" style={{ animation: "fadeInUp 0.8s ease-out 0.2s both" }}>
              Zero commission. Full control. Complete restaurant management — menu, orders, QR codes, payments, analytics & more.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3" style={{ animation: "fadeInUp 0.8s ease-out 0.4s both" }}>
              <Link to="/admin/auth">
                <Button size="lg" className="text-base px-8 shadow-lg shadow-primary/25">
                  Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="text-base px-8 border-white/20 text-white hover:bg-white/10" onClick={() => scrollTo("demo")}>
                See Live Demo
              </Button>
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 3: FEATURES ═══════════════ */}
        <section id="features" className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Everything You Need</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              A complete toolkit to run your restaurant digitally — no third-party commissions, no complexity.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
              {FEATURES.map((f, i) => (
                <Card key={i} className="group p-5 border bg-card hover:shadow-lg hover:-translate-y-1 hover:border-primary/30 transition-all duration-300">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 4: LIVE STATS ═══════════════ */}
        <section ref={statsRef} className="py-16 md:py-20" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63)" }}>
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-white">{restaurantCount}+</div>
                <div className="text-gray-400 mt-1 text-sm">Restaurants</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-white">{orderCount.toLocaleString()}+</div>
                <div className="text-gray-400 mt-1 text-sm">Orders Served</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-white">₹{revenueCount.toLocaleString()}+</div>
                <div className="text-gray-400 mt-1 text-sm">Revenue Processed</div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 5: PRICING ═══════════════ */}
        <section id="pricing" className="py-20 md:py-28 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
            <p className="text-center text-muted-foreground mb-8 max-w-xl mx-auto">
              Start free. Upgrade when you grow. No hidden fees.
            </p>

            {/* Monthly / Yearly Toggle */}
            <div className="flex items-center justify-center gap-3 mb-12">
              <span className={`text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
              <button
                onClick={() => setIsYearly(!isYearly)}
                className={`relative w-14 h-7 rounded-full transition-colors ${isYearly ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${isYearly ? "translate-x-7" : "translate-x-0"}`} />
              </button>
              <span className={`text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>
                Yearly
              </span>
              {isYearly && (
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-400">
                  Save up to 17%
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {(plans || []).map((plan: any, i: number) => {
                const features = (plan.features && typeof plan.features === "object" && !Array.isArray(plan.features))
                  ? plan.features as Record<string, any> : {};

                // Separate boolean features and limits
                const booleanFeatures = Object.entries(features)
                  .filter(([, val]) => typeof val === "boolean")
                  .sort(([, a], [, b]) => (b ? 1 : 0) - (a ? 1 : 0)); // enabled first
                const limitFeatures = Object.entries(features)
                  .filter(([, val]) => typeof val === "number");

                const isMiddle = i === 1;
                const displayPrice = isYearly && plan.yearly_price_cents > 0
                  ? plan.yearly_price_cents
                  : plan.price_cents;
                const billingLabel = isYearly && plan.yearly_price_cents > 0 ? "year" : "month";

                // Calculate monthly equivalent for yearly
                const monthlyEquivalent = isYearly && plan.yearly_price_cents > 0
                  ? Math.round(plan.yearly_price_cents / 12)
                  : null;

                return (
                  <Card key={plan.id} className={`relative p-6 flex flex-col ${isMiddle ? "border-primary shadow-xl scale-[1.03] ring-2 ring-primary/20" : "border"}`}>
                    {isMiddle && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                          <Star className="h-3 w-3" /> Recommended
                        </span>
                      </div>
                    )}
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 min-h-[40px]">{plan.description || ""}</p>
                    <div className="mt-4 mb-1">
                      <span className="text-3xl font-extrabold">
                        {displayPrice === 0 ? "Free" : formatMoney(displayPrice, plan.currency || "INR")}
                      </span>
                      {displayPrice > 0 && <span className="text-muted-foreground text-sm">/{billingLabel}</span>}
                    </div>
                    {monthlyEquivalent && monthlyEquivalent > 0 && (
                      <p className="text-xs text-muted-foreground mb-4">
                        That's {formatMoney(monthlyEquivalent, plan.currency || "INR")}/month
                      </p>
                    )}
                    {!monthlyEquivalent && <div className="mb-4" />}

                    {/* Limit features — shown as highlights */}
                    {limitFeatures.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {limitFeatures.map(([key, val]) => (
                          <span key={key} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                            {val === -1 ? "Unlimited" : val} {FEATURE_LABELS[key]?.replace(" Limit", "") || key.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Boolean features */}
                    <ul className="space-y-2 flex-1 mb-6">
                      {booleanFeatures.slice(0, showAllFeatures[plan.id] ? undefined : 8).map(([key, val]) => (
                        <li key={key} className="flex items-start gap-2 text-sm">
                          {val ? <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />}
                          <span className={val ? "" : "text-muted-foreground/60"}>{FEATURE_LABELS[key] || key.replace(/_/g, " ")}</span>
                        </li>
                      ))}
                      {booleanFeatures.length > 8 && (
                        <li>
                          <button
                            onClick={() => setShowAllFeatures(prev => ({ ...prev, [plan.id]: !prev[plan.id] }))}
                            className="text-xs text-primary font-medium hover:underline"
                          >
                            {showAllFeatures[plan.id]
                              ? "Show less"
                              : `+ ${booleanFeatures.length - 8} more features`}
                          </button>
                        </li>
                      )}
                    </ul>
                    <Link to="/admin/auth" className="mt-auto">
                      <Button className="w-full" variant={isMiddle ? "default" : "outline"}>
                        {plan.price_cents === 0 ? "Start Free" : plan.trial_days ? `Start ${plan.trial_days}-Day Trial` : "Get Started"}
                      </Button>
                    </Link>
                  </Card>
                );
              })}
              {(!plans || plans.length === 0) && (
                <div className="col-span-3 text-center text-muted-foreground py-8">Loading plans...</div>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 6: TESTIMONIALS ═══════════════ */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-12">What Restaurant Owners Say</h2>
            <div className="relative min-h-[180px]">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className={`transition-all duration-500 absolute inset-0 flex flex-col items-center justify-center ${i === activeTestimonial ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
                  <p className="text-lg md:text-xl italic text-muted-foreground mb-6 leading-relaxed">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {t.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.restaurant}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-2 mt-6">
              {TESTIMONIALS.map((_, i) => (
                <button key={i} onClick={() => setActiveTestimonial(i)} className={`h-2 rounded-full transition-all ${i === activeTestimonial ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`} />
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 7: DEMO ═══════════════ */}
        <section id="demo" className="py-16 md:py-20" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.9), #6366f1)" }}>
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">See It In Action</h2>
            <p className="text-white/80 mb-8 max-w-lg mx-auto">
              Experience the full customer ordering flow — browse menu, add items, customize & checkout.
            </p>
            <Link to="/r/vrindavan">
              <Button size="lg" variant="outline" className="text-base px-8 border-white/30 text-white hover:bg-white/10">
                Visit Demo Restaurant <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* ═══════════════ SECTION 8: FAQ ═══════════════ */}
        <section id="faq" className="py-20 md:py-28">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="space-y-2">
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-4">
                  <AccordionTrigger className="text-left font-medium py-4">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      {/* ═══════════════ SECTION 9: FOOTER ═══════════════ */}
      <footer className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <div className="text-lg font-bold mb-3">🍽️ Dine Delight</div>
              <p className="text-sm text-muted-foreground">Complete restaurant management platform. Zero commission. Full control.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollTo("features")} className="hover:text-foreground transition-colors">Features</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="hover:text-foreground transition-colors">Pricing</button></li>
                <li><button onClick={() => scrollTo("demo")} className="hover:text-foreground transition-colors">Demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollTo("faq")} className="hover:text-foreground transition-colors">FAQ</button></li>
                <li><a href="mailto:support@dinedelight.com" className="hover:text-foreground transition-colors">Contact</a></li>
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Access</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/admin/auth" className="hover:text-foreground transition-colors">Restaurant Login</Link></li>
                <li><Link to="/superadmin/auth" className="hover:text-foreground transition-colors">Admin Portal</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>© {new Date().getFullYear()} Dine Delight. All rights reserved.</span>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          from { transform: translateY(0); }
          to { transform: translateY(-15px); }
        }
      `}</style>
    </div>
  );
}
