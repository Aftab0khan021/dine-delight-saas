import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Phone, Star, Package, LogOut, ArrowLeft, Loader2, ArrowRight, Edit2, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/formatting";
import { Turnstile } from "@/components/security/Turnstile";

export default function CustomerDashboard() {
  const { restaurantSlug } = useParams();
  const { toast } = useToast();
  const slug = (restaurantSlug ?? "").trim();

  // Auth State
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "dashboard">("phone");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Once authenticated
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Address State
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("");
  const [newAddressText, setNewAddressText] = useState("");

  // 1. Fetch Restaurant details
  const restaurantQuery = useQuery({
    queryKey: ["customer-dashboard", "restaurant", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, logo_url, currency_code, settings")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  const restaurant = restaurantQuery.data;

  // Restore session from localStorage
  useEffect(() => {
    if (!restaurant?.id) return;
    const storedSession = localStorage.getItem(`customer_session_${restaurant.id}`);
    if (storedSession) {
      const sessionData = JSON.parse(storedSession);
      // Validate expiration
      if (sessionData.expires_at && new Date(sessionData.expires_at) > new Date()) {
        setPhone(sessionData.phone);
        setStep("dashboard");
      } else {
        localStorage.removeItem(`customer_session_${restaurant.id}`);
      }
    }
  }, [restaurant?.id]);

  // Handle Send OTP
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      toast({ title: "Invalid Phone", description: "Please enter a valid phone number.", variant: "destructive" });
      return;
    }
    /*
    if (!turnstileToken) {
      toast({ title: "Security Check", description: "Please complete the captcha.", variant: "destructive" });
      return;
    }
    */

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { phone, restaurant_id: restaurant!.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStep("otp");
      toast({ title: "OTP Sent", description: "Check your phone for the code." });
    } catch (err: any) {
      toast({ title: "Error sending OTP", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Handle Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      toast({ title: "Invalid OTP", description: "Please enter the OTP sent to you.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { phone, otp_code: otp, restaurant_id: restaurant!.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.verified) {
        // Successful login
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days session
        localStorage.setItem(`customer_session_${restaurant!.id}`, JSON.stringify({ phone, expires_at: expiresAt.toISOString() }));
        
        setStep("dashboard");
        toast({ title: "Welcome back!", description: "You are now logged in." });
      } else {
        toast({ title: "Invalid OTP", description: "Please try again.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error verifying OTP", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (restaurant?.id) {
      localStorage.removeItem(`customer_session_${restaurant.id}`);
    }
    setPhone("");
    setOtp("");
    setStep("phone");
  };

  // Queries for Dashboard
  const profileQuery = useQuery({
    queryKey: ["customer-dashboard", "profile", phone],
    enabled: step === "dashboard" && !!phone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["customer-dashboard", "orders", phone, restaurant?.id],
    enabled: step === "dashboard" && !!phone && !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_cents, placed_at, order_items(name_snapshot, quantity, line_total_cents)")
        .eq("customer_phone", phone)
        .eq("restaurant_id", restaurant!.id)
        .order("placed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const loyaltyQuery = useQuery({
    queryKey: ["customer-dashboard", "loyalty", phone, restaurant?.id],
    enabled: step === "dashboard" && !!phone && !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_points")
        .select("points, lifetime_points")
        .eq("customer_phone", phone)
        .eq("restaurant_id", restaurant!.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error; // ignore no rows
      return data;
    },
  });

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("customer_profiles")
        .update({ name: editName, email: editEmail })
        .eq("phone", phone);
      if (error) throw error;
      toast({ title: "Success", description: "Profile updated successfully." });
      setIsEditingProfile(false);
      profileQuery.refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddress = async () => {
    if (!newAddressText) return;
    setLoading(true);
    try {
      const currentAddresses = profileQuery.data?.saved_addresses || [];
      const newAddresses = [...currentAddresses, { label: newAddressLabel || "Address", address: newAddressText }];
      
      const { error } = await supabase
        .from("customer_profiles")
        .update({ saved_addresses: newAddresses })
        .eq("phone", phone);
        
      if (error) throw error;
      toast({ title: "Success", description: "Address added successfully." });
      setIsAddingAddress(false);
      setNewAddressLabel("");
      setNewAddressText("");
      profileQuery.refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAddress = async (index: number) => {
    setLoading(true);
    try {
      const currentAddresses = profileQuery.data?.saved_addresses || [];
      const newAddresses = currentAddresses.filter((_: any, i: number) => i !== index);
      
      const { error } = await supabase
        .from("customer_profiles")
        .update({ saved_addresses: newAddresses })
        .eq("phone", phone);
        
      if (error) throw error;
      toast({ title: "Success", description: "Address removed." });
      profileQuery.refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (restaurantQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (restaurantQuery.error || !restaurant) {
    return <div className="min-h-screen flex items-center justify-center text-destructive">Restaurant not found.</div>;
  }

  const themeColor = (restaurant.settings as any)?.theme?.primary_color || "hsl(var(--primary))";

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/r/${slug}/menu`}><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div className="flex items-center gap-2">
              {restaurant.logo_url && <img src={restaurant.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
              <span className="font-semibold">{restaurant.name}</span>
            </div>
          </div>
          {step === "dashboard" && (
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          )}
        </div>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 py-8 pb-20">
        
        {/* LOGIN FLOW */}
        {step !== "dashboard" && (
          <div className="max-w-md mx-auto mt-8">
            <Card className="shadow-lg border-primary/20">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
                <CardDescription>Log in to view your orders and rewards.</CardDescription>
              </CardHeader>
              <CardContent>
                {step === "phone" ? (
                  <form onSubmit={handleSendOTP} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Phone Number</label>
                      <Input
                        type="tel"
                        placeholder="e.g. +91 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        className="h-12"
                      />
                    </div>
                    {/* Security Challenge (Uncomment to enforce turnstile) 
                    <div className="flex justify-center py-2">
                      <Turnstile onSuccess={setTurnstileToken} />
                    </div>
                    */}
                    <Button type="submit" className="w-full h-12" disabled={loading} style={{ backgroundColor: themeColor }}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOTP} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-center block">Enter 6-digit OTP sent to {phone}</label>
                      <Input
                        type="text"
                        placeholder="• • • • • •"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                        className="h-12 text-center text-2xl tracking-widest"
                        maxLength={6}
                      />
                    </div>
                    <Button type="submit" className="w-full h-12" disabled={loading} style={{ backgroundColor: themeColor }}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Login"}
                    </Button>
                    <div className="text-center">
                      <Button variant="link" type="button" onClick={() => setStep("phone")} className="text-muted-foreground">
                        Change phone number
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* DASHBOARD */}
        {step === "dashboard" && (
          <div className="space-y-6">
            
            {/* Loyalty Section */}
            {loyaltyQuery.data && (
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/40 border-amber-200 dark:border-amber-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-amber-800 dark:text-amber-200 font-bold text-lg flex items-center gap-2">
                        <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                        My Rewards
                      </h3>
                      <p className="text-amber-700 dark:text-amber-400 text-sm mt-1">
                        Earn points on every order!
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-amber-600 dark:text-amber-400">
                        {loyaltyQuery.data.points || 0}
                      </div>
                      <div className="text-xs text-amber-800/70 font-medium uppercase tracking-wider">Points Available</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Profile Info */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Phone className="h-5 w-5" />
                    </div>
                    {isEditingProfile ? (
                      <div className="space-y-3 w-full">
                        <Input 
                          placeholder="Your Name" 
                          value={editName} 
                          onChange={e => setEditName(e.target.value)} 
                        />
                        <Input 
                          placeholder="Email Address" 
                          type="email" 
                          value={editEmail} 
                          onChange={e => setEditEmail(e.target.value)} 
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleUpdateProfile} disabled={loading}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setIsEditingProfile(false)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-semibold text-lg">{profileQuery.data?.name || "Customer"}</h3>
                        <p className="text-muted-foreground">{phone}</p>
                        {profileQuery.data?.email && <p className="text-sm text-muted-foreground">{profileQuery.data.email}</p>}
                      </div>
                    )}
                  </div>
                  {!isEditingProfile && (
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditName(profileQuery.data?.name || "");
                      setEditEmail(profileQuery.data?.email || "");
                      setIsEditingProfile(true);
                    }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Saved Addresses */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    Saved Addresses
                  </h3>
                  {!isAddingAddress && (
                    <Button variant="outline" size="sm" onClick={() => setIsAddingAddress(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  )}
                </div>

                {isAddingAddress && (
                  <div className="mb-4 p-4 border rounded-md bg-muted/10 space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Label (e.g. Home, Work)</label>
                      <Input value={newAddressLabel} onChange={e => setNewAddressLabel(e.target.value)} placeholder="Home" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Full Address</label>
                      <Input value={newAddressText} onChange={e => setNewAddressText(e.target.value)} placeholder="123 Main St, Apt 4B" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddAddress} disabled={loading || !newAddressText}>Save Address</Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsAddingAddress(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {profileQuery.data?.saved_addresses && Array.isArray(profileQuery.data.saved_addresses) && profileQuery.data.saved_addresses.length > 0 ? (
                  <div className="space-y-3">
                    {profileQuery.data.saved_addresses.map((addr: any, i: number) => (
                      <div key={i} className="flex flex-col gap-1 p-3 border rounded-md group relative pr-10">
                        <span className="font-medium text-sm">{addr.label || 'Address'}</span>
                        <span className="text-sm text-muted-foreground">{addr.address}</span>
                        <button 
                          onClick={() => handleRemoveAddress(i)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  !isAddingAddress && (
                    <div className="text-center p-4 bg-muted/20 rounded-md border border-dashed">
                      <p className="text-sm text-muted-foreground">No saved addresses found.</p>
                    </div>
                  )
                )}
              </CardContent>
            </Card>

            {/* Order History */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-tight">Recent Orders</h3>
              </div>

              {ordersQuery.isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : ordersQuery.data?.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">You haven't placed any orders yet.</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link to={`/r/${slug}/menu`}>Browse Menu</Link>
                  </Button>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {ordersQuery.data?.map((order) => (
                    <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground font-medium">
                            {new Date(order.placed_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(order.placed_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">#{order.id.slice(0, 8).toUpperCase()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatMoney(order.total_cents, restaurant.currency_code)}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wider">
                            {order.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <ul className="space-y-2">
                          {order.order_items?.map((item: any, i: number) => (
                            <li key={i} className="flex justify-between text-sm">
                              <span className="flex gap-2">
                                <span className="font-medium text-muted-foreground">{item.quantity}x</span>
                                <span>{item.name_snapshot}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
