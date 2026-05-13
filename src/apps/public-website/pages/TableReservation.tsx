import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { usePublicFeatureAccess } from "../hooks/usePublicFeatureAccess";
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
  Search,
  XCircle,
  CircleDot,
  Grid3X3,
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
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [resSubmitting, setResSubmitting] = useState(false);
  const [resSuccess, setResSuccess] = useState(false);

  // Status tracking
  const [trackPhone, setTrackPhone] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackedReservations, setTrackedReservations] = useState<any[] | null>(null);

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

  // Feature flag check (must be before any early returns to obey Rules of Hooks)
  const { isFeatureEnabled: isResFlagOn, isLoading: featuresLoading } = usePublicFeatureAccess(restaurant?.id);

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
      table_id: selectedTableIds.length > 0 ? selectedTableIds[0] : null,
      table_ids: selectedTableIds.length > 0 ? selectedTableIds : [],
    });
    setResSubmitting(false);
    if (error) {
      toast({ title: "Failed to book", description: error.message, variant: "destructive" });
      return;
    }
    setResSuccess(true);
    toast({ title: "Reservation Submitted!", description: "The restaurant will confirm your booking." });
  };

  const handleTrackReservation = async () => {
    if (!trackPhone || trackPhone.length < 10 || !restaurant?.id) return;
    setTrackLoading(true);
    try {
      const { data } = await supabase
        .from("reservations")
        .select("id, customer_name, party_size, reservation_date, reservation_time, status, notes, updated_at")
        .eq("restaurant_id", restaurant.id)
        .eq("customer_phone", trackPhone)
        .order("reservation_date", { ascending: false })
        .limit(5);
      setTrackedReservations(data || []);
    } catch {
      setTrackedReservations([]);
    }
    setTrackLoading(false);
  };

  const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    pending: { icon: CircleDot, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", label: "Pending Confirmation" },
    confirmed: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", label: "Confirmed ✅" },
    seated: { icon: Users, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800", label: "Seated 🍽️" },
    completed: { icon: CheckCircle2, color: "text-gray-600", bg: "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700", label: "Completed" },
    cancelled: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", label: "Cancelled ❌" },
    no_show: { icon: XCircle, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800", label: "No Show" },
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

  if (!featuresLoading && !isResFlagOn('table_reservations')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <CalendarDays className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-2xl font-bold">Reservations Not Available</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Table reservations are not currently available for this restaurant.
        </p>
        <Button className="mt-6" asChild>
          <Link to={`/r/${slug}`}>Back to Restaurant</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
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
                      <PhoneInput
                        value={resPhone}
                        onChange={setResPhone}
                        required
                        heightClass="h-11"
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
                      <DateInput
                        value={resDate}
                        onChange={setResDate}
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

              {/* Table Selection (visual floor plan) */}
              <TablePicker
                restaurantId={restaurant!.id}
                date={resDate}
                partySize={resParty}
                selectedTableIds={selectedTableIds}
                onSelect={setSelectedTableIds}
                themeColor={themeColor}
              />

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

        {/* Track Reservation Status */}
        <div className="mt-12 border-t pt-8">
          <div className="text-center space-y-2 mb-6">
            <h2 className="text-xl font-bold tracking-tight">Check Reservation Status</h2>
            <p className="text-sm text-muted-foreground">Enter your phone number to view your bookings</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
            <div className="flex-1">
              <PhoneInput
                value={trackPhone}
                onChange={setTrackPhone}
                heightClass="h-11"
                placeholder="Enter 10-digit number"
              />
            </div>
            <Button
              onClick={handleTrackReservation}
              disabled={trackLoading || trackPhone.replace(/\D/g, '').length < 10}
              style={{ backgroundColor: themeColor }}
              className="shrink-0 px-6 h-11 w-full sm:w-auto"
            >
              {trackLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4 mr-1" /> Check</>}
            </Button>
          </div>

          {trackedReservations !== null && (
            <div className="mt-6 space-y-3 max-w-md mx-auto">
              {trackedReservations.length === 0 ? (
                <Card className="p-6 text-center border-dashed">
                  <p className="text-muted-foreground text-sm">No reservations found for this number.</p>
                </Card>
              ) : (
                trackedReservations.map((r: any) => {
                  const sc = statusConfig[r.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <Card key={r.id} className={`border ${sc.bg} overflow-hidden`}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`h-5 w-5 ${sc.color}`} />
                            <span className={`font-semibold text-sm ${sc.color}`}>{sc.label}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">#{r.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {new Date(r.reservation_date + "T00:00:00").toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {r.reservation_time?.slice(0, 5)}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            {r.party_size} guests
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="h-3.5 w-3.5" />
                            {r.customer_name}
                          </div>
                        </div>
                        {r.notes && <p className="text-xs text-muted-foreground italic">{r.notes}</p>}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// --- Public Table Picker (visual table selection for customers) ---
function TablePicker({
  restaurantId,
  date,
  partySize,
  selectedTableIds,
  onSelect,
  themeColor,
}: {
  restaurantId: string;
  date: string;
  partySize: number;
  selectedTableIds: string[];
  onSelect: (ids: string[]) => void;
  themeColor: string;
}) {
  // Fetch all active tables
  const { data: tables = [] } = useQuery({
    queryKey: ["public", "tables", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, label, capacity, is_active, shape, floor")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("label");
      if (error) throw error;
      return (data ?? []) as { id: string; label: string; capacity: number; is_active: boolean; shape: string; floor: string }[];
    },
  });

  // Fetch reservations for the selected date to mark tables as taken
  const { data: reservedTableIds = [] } = useQuery({
    queryKey: ["public", "reserved-tables", restaurantId, date],
    enabled: !!restaurantId && !!date,
    queryFn: async () => {
      const { data } = await supabase
        .from("reservations")
        .select("table_id, table_ids")
        .eq("restaurant_id", restaurantId)
        .eq("reservation_date", date)
        .in("status", ["pending", "confirmed", "seated"]);
      // Collect all reserved table IDs from both columns
      const ids = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.table_id) ids.add(r.table_id);
        if (Array.isArray(r.table_ids)) r.table_ids.forEach((id: string) => ids.add(id));
      });
      return Array.from(ids);
    },
  });

  if (tables.length === 0) return null;

  // Calculate combined capacity of selected tables
  const selectedCapacity = tables
    .filter(t => selectedTableIds.includes(t.id))
    .reduce((sum, t) => sum + t.capacity, 0);

  const capacityMet = selectedCapacity >= partySize;

  // Check if a single table can fit the party
  const singleTableFits = tables.some(t => t.capacity >= partySize && !reservedTableIds.includes(t.id));

  // Toggle a table in/out of the selection
  const toggleTable = (tableId: string) => {
    if (selectedTableIds.includes(tableId)) {
      onSelect(selectedTableIds.filter(id => id !== tableId));
    } else {
      onSelect([...selectedTableIds, tableId]);
    }
  };

  // Group by floor
  const floors = Array.from(new Set(tables.map(t => t.floor || "main"))).sort();

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Choose Tables</h3>
          <span className="text-xs text-muted-foreground ml-auto">(Optional — multi-select)</span>
        </div>

        {/* Info banner when multi-table is needed */}
        {!singleTableFits && partySize > 1 && date && (
          <div className="text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-700 dark:text-blue-300">
            <strong>💡 Multiple tables needed:</strong> No single table fits {partySize} guests. Select multiple tables to combine their capacity.
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border-2 border-green-500 bg-green-50 dark:bg-green-950/30" />
            Available
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30" />
            Reserved
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border-2 bg-primary/10" style={{ borderColor: themeColor }} />
            Selected
          </div>
        </div>

        {!date && (
          <p className="text-sm text-muted-foreground text-center py-4">Select a date above to see available tables</p>
        )}

        {date && floors.map(floor => {
          const floorTables = tables.filter(t => (t.floor || "main") === floor);
          return (
            <div key={floor} className="space-y-2">
              {floors.length > 1 && (
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider capitalize">{floor}</p>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {floorTables.map(table => {
                  const isReserved = reservedTableIds.includes(table.id);
                  const isSelected = selectedTableIds.includes(table.id);
                  const isDisabled = isReserved;
                  const isRound = table.shape === "round";

                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => toggleTable(table.id)}
                      className={`
                        relative flex flex-col items-center justify-center gap-0.5 p-3 border-2 transition-all
                        ${isRound ? "rounded-full" : "rounded-xl"}
                        ${isSelected
                          ? "shadow-md scale-[1.02]"
                          : isDisabled
                            ? "opacity-50 cursor-not-allowed border-muted bg-muted/30"
                            : "hover:shadow-sm hover:scale-[1.01] cursor-pointer border-green-400 bg-green-50/50 dark:bg-green-950/20"
                        }
                      `}
                      style={isSelected ? { borderColor: themeColor, backgroundColor: `${themeColor}10` } : isReserved ? { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)' } : undefined}
                    >
                      <span className="text-xs font-bold truncate max-w-full">{table.label}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />{table.capacity}
                      </span>
                      {isReserved && (
                        <span className="absolute -top-1 -right-1 text-[8px] bg-amber-500 text-white px-1 rounded-full font-bold">Booked</span>
                      )}
                      {isSelected && (
                        <CheckCircle2 className="absolute -top-1.5 -right-1.5 h-4 w-4" style={{ color: themeColor }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Capacity summary */}
        {selectedTableIds.length > 0 && (
          <div className={`text-xs text-center rounded-lg px-3 py-2 border ${
            capacityMet
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
          }`}>
            {selectedTableIds.length === 1
              ? `✓ 1 table selected — Capacity: ${selectedCapacity} seats`
              : `✓ ${selectedTableIds.length} tables selected — Combined capacity: ${selectedCapacity} seats`
            }
            {!capacityMet && (
              <span className="block mt-1 font-semibold">
                ⚠️ Need {partySize - selectedCapacity} more seat{partySize - selectedCapacity !== 1 ? 's' : ''} — select another table
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
