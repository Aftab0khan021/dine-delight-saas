import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Turnstile } from "@/components/security/Turnstile";

export default function AdminAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Restaurant admin signup fields
  const [restaurantName, setRestaurantName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [phone, setPhone] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  // Ref to suppress onAuthStateChange navigation during signup flows
  const isSigningUpRef = useRef(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/admin");
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Don't navigate during signup — we need to finish DB operations first
      if (isSigningUpRef.current) return;
      if (session) {
        navigate("/admin");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast({ title: "Security Check Required", description: "Please complete the security challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: turnstileToken }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Signed in successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      // Reset token on error so user verify again
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast({ title: "Security Check Required", description: "Please complete the security challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);
    isSigningUpRef.current = true;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
          data: {
            full_name: fullName,
          },
          captchaToken: turnstileToken
        },
      });

      if (error) throw error;

      // Defensive: ensure profile exists even if trigger fails
      if (data.user) {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();

        if (!existingProfile) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            email,
            full_name: fullName,
            account_status: "pending",
          }).then(() => {});
        }
      }

      toast({
        title: "Success",
        description: "Account created successfully! You can now sign in.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      setLoading(false);
      isSigningUpRef.current = false;
    }
  };

  const handleRestaurantSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast({ title: "Security Check Required", description: "Please complete the security challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);
    isSigningUpRef.current = true;

    try {
      // 1. Create auth account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          captchaToken: turnstileToken
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error("Failed to create account");

      const userId = data.user.id;

      // 2. Ensure profile exists (trigger may fail due to CHECK constraints)
      //    Use upsert to handle both cases: profile created by trigger, or not
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          email: email,
          full_name: fullName,
          account_status: "pending",
        }, { onConflict: "id" });

      if (profileError) {
        console.error("Profile creation failed:", profileError);
        // Profile may already exist from trigger — try updating status
        await supabase
          .from("profiles")
          .update({ account_status: "pending", full_name: fullName })
          .eq("id", userId);
      }

      // 3. Create restaurant admin request
      const slug = restaurantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const { error: requestError } = await supabase
        .from("restaurant_admin_requests")
        .insert({
          user_id: userId,
          restaurant_name: restaurantName,
          restaurant_slug: slug || 'my-restaurant',
          business_type: businessType || null,
          phone: phone || null,
          status: 'pending'
        });

      if (requestError) {
        console.error("Admin request creation failed:", requestError);
        // Don't throw — the account is created, show a helpful message
        toast({
          title: "Account Created",
          description: "Your account was created but the request submission had an issue. Please contact support.",
          variant: "destructive",
        });
        navigate("/admin");
        return;
      }

      toast({
        title: "Request Submitted!",
        description: "Your application is pending approval. We'll email you once reviewed.",
      });

      navigate("/admin");
    } catch (error: any) {
      console.error("Restaurant signup error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      setLoading(false);
      isSigningUpRef.current = false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Restaurant Admin</CardTitle>
          <CardDescription>Sign in to manage your restaurant</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="signin" className="text-xs sm:text-sm py-2">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs sm:text-sm py-2">Sign Up</TabsTrigger>
              <TabsTrigger value="restaurant" className="text-xs sm:text-sm py-2 leading-tight">Restaurant<br className="sm:hidden" /> Admin</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <Turnstile
                  onSuccess={setTurnstileToken}
                  onWidgetId={setTurnstileWidgetId}
                  action="login"
                  className="flex justify-center py-2"
                />

                <Button type="submit" className="w-full" disabled={loading || !turnstileToken}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setForgotSent(false); }}
                    className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline transition-colors"
                  >
                    Forgot your password?
                  </button>
                </div>
              </form>

              {/* Forgot Password Modal */}
              {showForgotPassword && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-background rounded-lg p-5 sm:p-6 w-full max-w-[min(400px,92vw)] shadow-xl space-y-4">
                    {forgotSent ? (
                      <div className="text-center space-y-3">
                        <div className="text-4xl">📬</div>
                        <h3 className="font-semibold text-lg">Check your email</h3>
                        <p className="text-sm text-muted-foreground">
                          We sent a password reset link to <strong>{forgotEmail}</strong>.
                          Click the link in the email to set a new password.
                        </p>
                        <Button variant="outline" className="w-full" onClick={() => setShowForgotPassword(false)}>
                          Close
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                          <h3 className="font-semibold text-lg">Reset Password</h3>
                          <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send you a reset link.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="forgot-email">Email</Label>
                          <input
                            id="forgot-email"
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="you@example.com"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForgotPassword(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" className="flex-1" disabled={forgotLoading}>
                            {forgotLoading ? "Sending..." : "Send Reset Link"}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Turnstile
                  onSuccess={setTurnstileToken}
                  onWidgetId={setTurnstileWidgetId}
                  action="signup"
                  className="flex justify-center py-2"
                />

                <Button type="submit" className="w-full" disabled={loading || !turnstileToken}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="restaurant">
              <form onSubmit={handleRestaurantSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rest-name">Full Name</Label>
                  <Input
                    id="rest-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rest-email">Email</Label>
                  <Input
                    id="rest-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rest-password">Password</Label>
                  <Input
                    id="rest-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Separator className="my-4" />
                <div className="text-sm font-medium text-muted-foreground">Restaurant Information</div>

                <div className="space-y-2">
                  <Label htmlFor="restaurant-name">Restaurant Name *</Label>
                  <Input
                    id="restaurant-name"
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="e.g., The Golden Spoon"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business-type">Business Type</Label>
                  <Select value={businessType} onValueChange={setBusinessType}>
                    <SelectTrigger id="business-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                      <SelectItem value="cafe">Café</SelectItem>
                      <SelectItem value="food-truck">Food Truck</SelectItem>
                      <SelectItem value="bakery">Bakery</SelectItem>
                      <SelectItem value="bar">Bar/Pub</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <Turnstile
                  onSuccess={setTurnstileToken}
                  onWidgetId={setTurnstileWidgetId}
                  action="restaurant-signup"
                  className="flex justify-center py-2"
                />

                <Button type="submit" className="w-full" disabled={loading || !turnstileToken || !restaurantName}>
                  {loading ? "Submitting..." : "Submit for Approval"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Your request will be reviewed by our team. You'll receive an email once approved.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
