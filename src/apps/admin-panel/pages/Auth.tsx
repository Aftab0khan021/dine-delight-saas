import { useState, useEffect } from "react";
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

  // Restaurant admin signup fields
  const [restaurantName, setRestaurantName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [phone, setPhone] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/admin");
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast({ title: "Security Check Required", description: "Please complete the security challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
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
      // Reset token on error
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast({ title: "Security Check Required", description: "Please complete the security challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);

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

      // 2. Create restaurant admin request
      const { error: requestError } = await supabase
        .from("restaurant_admin_requests")
        .insert({
          user_id: data.user?.id,
          restaurant_name: restaurantName,
          restaurant_slug: restaurantName.toLowerCase().replace(/\s+/g, '-'),
          business_type: businessType,
          phone: phone || null,
          status: 'pending'
        });

      if (requestError) throw requestError;

      toast({
        title: "Request Submitted!",
        description: "Your application is pending approval. We'll email you once reviewed.",
      });

      // Navigate to show pending screen
      navigate("/admin");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
      }
    } finally {
      setLoading(false);
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
              <TabsTrigger value="restaurant">Restaurant Admin</TabsTrigger>
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
              </form>
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
