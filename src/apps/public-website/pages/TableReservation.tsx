import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Users,
  Phone,
  User,
  MessageSquare,
  CheckCircle2,
  Loader2,
  Moon,
  Sun,
  PartyPopper,
} from "lucide-react";

function normalizeSettings(settings: any | null) {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
}

export default function TableReservation() {
  const { restaurantSlug } = useParams();
  const { toast } = useToast();
  const slug = (restaurantSlug ?? "").trim();

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("dd-dark") === "1");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("dd-dark", darkMode ? "1" : "0");
  }, [darkMode]);

  // Form state
  const [resName, setResName] = useState("");
  const [resPhone, setResPhone] = useState("");
  const [resEmail, setResEmail] = useState("");
  const [resDate, setResDate] = useState("");
  const [resTime, setResTime] = useState("");
  const [resParty, setResParty] = useState(2);
  const [resNotes, setResNotes] = useState("");
  const [resOccasion, setResOccasion] = useState("");
  const [resSubmitting, setResSubmitting] = useState(false);
  const [resSuccess, setResSuccess] = useState(false);

  // Fetch Restaurant
  const { data: restaurant, isLoading, error } = useQuery({
    queryKey: ["public", "table-reservation", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, slug, logo_url, description, settings, operating_hours, currency_code")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  useSEO({
    title: restaurant ? `Book a Table — ${restaurant.name} | Dine Delight` : "Reserve a Table | Dine Delight",
    description: restaurant ? `Reserve a table at ${restaurant.name}. Choose your date, time, party size and enjoy a great dining experience.` : undefined,
  });

  const settings = normalizeSettings(restaurant?.settings);
  const themeColor = settings?.theme?.primary_color || "#f59e0b"; // amber-500

  const occasions = [
    { value: "", label: "Select occasion (optional)" },
    { value: "birthday", label: "🎂 Birthday" },
    { value: "anniversary", label: "💍 Anniversary" },
    { value: "date_night", label: "❤️ Date Night" },
    { value: "business", label: "💼 Business Dinner" },
    { value: "family", label: "👨‍👩‍👧‍👦 Family Gathering" },
    { value: "celebration", label: "🎉 Celebration" },
    { value: "other", label: "✨ Other" },
  ];

  const handleReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resName || !resPhone || !resDate || !resTime) {
      toast({ title: "Fill all required fields", variant: "destructive" });
      return;
    }
    setResSubmitting(true);

    const notesText = [
      resOccasion ? `Occasion: ${occasions.find(o => o.value === resOccasion)?.label || resOccasion}` : "",
      resNotes,
    ].filter(Boolean).join(" | ");

    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurant!.id,
      customer_name: resName,
      customer_phone: resPhone,
      customer_email: resEmail || null,
      party_size: resParty,
      reservation_date: resDate,
      reservation_time: resTime,
      notes: notesText || null,
      status: "pending",
    });
    setResSubmitting(false);
    if (error) {
      toast({ title: "Failed to book", description: error.message, variant: "destructive" });
      return;
    }
    setResSuccess(true);
    toast({ title: "Reservation Submitted!", description: "The restaurant will confirm your booking." });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-destructive">
        Restaurant not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Dark mode toggle */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="fixed top-4 right-4 z-50 h-10 w-10 rounded-full bg-card border shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Toggle dark mode"
      >
        {darkMode ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/r/${slug}`}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            {restaurant.logo_url && (
              <img src={restaurant.logo_url} alt="" className="h-8 w-8 rounded-full object-cover border shrink-0" />
            )}
            <span className="font-semibold truncate">{restaurant.name}</span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-2xl mx-auto px-4 py-8 pb-20">
        {resSuccess ? (
          /* SUCCESS STATE */
          <div className="text-center space-y-6 mt-8">
            <div className="mx-auto h-20 w-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${themeColor}15` }}>
              <CheckCircle2 className="h-10 w-10" style={{ color: themeColor }} />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Reservation Submitted!</h2>
              <p className="text-muted-foreground text-lg">
                We've received your booking request for <strong>{resParty} {resParty === 1 ? "guest" : "guests"}</strong> on{" "}
                <strong>{new Date(resDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</strong>{" "}
                at <strong>{resTime}</strong>.
              </p>
            </div>
            <Card className="max-w-sm mx-auto border-2" style={{ borderColor: `${themeColor}30` }}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{resName}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{resPhone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{resDate} at {resTime}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{resParty} {resParty === 1 ? "guest" : "guests"}</span>
                </div>
                {resOccasion && (
                  <div className="flex items-center gap-3 text-sm">
                    <PartyPopper className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{occasions.find(o => o.value === resOccasion)?.label}</span>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground">
              You will receive a confirmation on your phone once the restaurant confirms your booking.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link to={`/r/${slug}`}>Back to Home</Link>
              </Button>
              <Button asChild style={{ backgroundColor: themeColor }}>
                <Link to={`/r/${slug}/menu`}>Browse Menu</Link>
              </Button>
            </div>
          </div>
        ) : (
          /* RESERVATION FORM */
          <div className="space-y-6">
            {/* Hero Banner */}
            <div className="text-center space-y-3 py-6">
              <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${themeColor}15` }}>
                <CalendarDays className="h-8 w-8" style={{ color: themeColor }} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Book Your Table</h1>
              <p className="text-muted-foreground text-lg max-w-md mx-auto">
                Reserve your spot for a delightful dining experience at {restaurant.name}.
              </p>
            </div>

            <form onSubmit={handleReservation} className="space-y-5">
              {/* Personal Details */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Personal Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Full Name *</Label>
                      <Input
                        value={resName}
                        onChange={e => setResName(e.target.value)}
                        placeholder="John Doe"
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone Number *</Label>
                      <Input
                        value={resPhone}
                        onChange={e => setResPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        type="tel"
                        required
                        className="h-11"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Booking Details */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Booking Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Select Date *</Label>
                      <Input
                        type="date"
                        value={resDate}
                        onChange={e => setResDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Select Time *</Label>
                      <Input
                        type="time"
                        value={resTime}
                        onChange={e => setResTime(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Number of Guests *</Label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setResParty(Math.max(1, resParty - 1))}
                        className="h-11 w-11 rounded-lg border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
                      >
                        −
                      </button>
                      <span className="text-2xl font-bold w-12 text-center">{resParty}</span>
                      <button
                        type="button"
                        onClick={() => setResParty(Math.min(20, resParty + 1))}
                        className="h-11 w-11 rounded-lg border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Special Requests */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Special Requests</h3>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><PartyPopper className="h-3.5 w-3.5" /> Occasion</Label>
                    <select
                      value={resOccasion}
                      onChange={e => setResOccasion(e.target.value)}
                      className="w-full h-11 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {occasions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Special Requests / Notes</Label>
                    <textarea
                      value={resNotes}
                      onChange={e => setResNotes(e.target.value)}
                      placeholder="E.g., window seat, high chair, dietary requirements, cake arrangement..."
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full h-13 text-base font-bold rounded-xl shadow-lg hover:shadow-xl transition-shadow"
                disabled={resSubmitting}
                style={{ backgroundColor: themeColor }}
              >
                {resSubmitting ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Booking...</>
                ) : (
                  <><CalendarDays className="h-5 w-5 mr-2" /> Book Table</>
                )}
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
